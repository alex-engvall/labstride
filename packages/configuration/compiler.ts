import type { LabstrideInstallationConfigurationV1 as Configuration, Condition } from '../../contracts/generated/config.ts';
import type { QualifiedProviderFieldBinding } from '../../contracts/generated/provider-binding.ts';
import type { ExtensionLock } from '../../contracts/generated/extension-lock.ts';
import type { ConfigurationSnapshot } from './snapshot.ts';
import type { HostProfile } from '../extensions/loader.ts';
import { inspectExtension } from '../extensions/loader.ts';
import { validated, validationIssues } from '../storage-sqlite/validation.ts';
import { canonical, digest, freeze } from './json.ts';
import { ConfigurationError, fieldValue, invalid, own } from './values.ts';
import { bindWorkflow, visitBindings } from './bindings.ts';
import type { BindingContext } from './bindings.ts';
import type { Value } from './values.ts';

export type ProviderBinding = QualifiedProviderFieldBinding;
export interface CompilerDependencies {
  lock: ExtensionLock;
  host: HostProfile;
  secrets: { exists(reference: string): boolean | Promise<boolean> };
  provider: { describeField(field: Configuration['fields'][string], credentialRef: string):
    ProviderDescription | Promise<ProviderDescription> };
  eventKinds?: readonly string[];
}
export type ProviderDescription = ProviderBinding & { displayName?: string; optionNames?: Record<string, string> };
export interface Diagnostic { code: string; path: string; message: string }
export interface CompiledConfiguration {
  readonly snapshot: ConfigurationSnapshot;
  bindWorkflow(workflow: string, fields: Record<string, { present: boolean; value?: Value }>, context: BindingContext): ReturnType<typeof bindWorkflow>;
  bindStep(workflow: string, stepId: string, fields: Record<string, { present: boolean; value?: Value }>, context: BindingContext): ReturnType<typeof bindWorkflow>[number];
}
export type Compilation = { schemaVersion: '1.0'; ok: true; configuration: CompiledConfiguration; diagnostics: [] } |
  { schemaVersion: '1.0'; ok: false; diagnostics: Diagnostic[] };
const compiled = new WeakMap<CompiledConfiguration, ConfigurationSnapshot>();
export function compiledSnapshot(configuration: CompiledConfiguration): ConfigurationSnapshot {
  const snapshot = compiled.get(configuration);
  if (!snapshot) invalid('/', 'Compile and preflight the installation before activation.');
  return snapshot;
}

function transitionRequired(condition: Condition): boolean {
  if ('all' in condition) return condition.all.some(transitionRequired);
  if ('any' in condition) return condition.any.every(transitionRequired);
  return 'op' in condition && condition.op === 'changedTo';
}
function validateCondition(condition: Condition, config: Configuration, bindings: Record<string, ProviderBinding>, path: string): void {
  if ('all' in condition || 'any' in condition) {
    const children = 'all' in condition ? condition.all : condition.any;
    children.forEach((child, i) => validateCondition(child, config, bindings, `${path}/${i}`)); return;
  }
  if ('not' in condition) { validateCondition(condition.not, config, bindings, `${path}/not`); return; }
  const field = own(config.fields, condition.field), binding = own(bindings, condition.field);
  if (!field || !binding) invalid(path, 'Configure and resolve the rule field.');
  if (!binding.readable || !binding.operators.includes(condition.op) ||
    (condition.op === 'changedTo' && (!binding.history || !binding.actorAttribution)))
    throw new ConfigurationError('unsupported_capability', path, 'Qualify this field, credential, operator, history and actor attribution before enablement.');
  if (condition.op === 'contains') {
    if (!['string','multi-select'].includes(field.type) || typeof condition.value !== 'string') invalid(path, 'contains requires a string or one multi-select option.');
    fieldValue(field.type === 'multi-select' ? { ...field, type: 'single-select' } : field, condition.value, true);
  } else if ('value' in condition) fieldValue(field, condition.value, true);
}
function staticInputTypes(node: unknown, schema: unknown, config: Configuration, path: string, literal = false): void {
  if (!schema || typeof schema !== 'object') return;
  const shape = schema as Record<string, unknown>;
  const object = node && typeof node === 'object' && !Array.isArray(node) ? node as Record<string, unknown> : undefined;
  let type: string;
  if (!literal && (typeof node === 'string' && node.startsWith('context.') || object?.binding === 'context')) {
    const token = object ? object.context : (node as string).slice(8);
    type = token === 'source' ? 'object' : 'string';
  } else if (!literal && object?.binding === 'field') {
    const field = own(config.fields, String(object.field));
    type = field?.type === 'multi-select' ? 'array' : field?.type === 'boolean' ? 'boolean' : field?.type === 'number' ? 'number' : 'string';
  } else if (!literal && object?.binding === 'literal') {
    staticInputTypes(object.value, schema, config, path, true); return;
  } else type = node === null ? 'null' : Array.isArray(node) ? 'array' : typeof node;
  const accepted = typeof shape.type === 'string' ? [shape.type] : shape.type;
  if (Array.isArray(accepted) && !accepted.includes(type) && !(type === 'number' && accepted.includes('integer')))
    invalid(path, 'Match the binding type to the installed action input schema.');
  if (object && (literal || !object.binding) && shape.properties && typeof shape.properties === 'object') {
    const properties = shape.properties as Record<string, unknown>;
    for (const key of Array.isArray(shape.required) ? shape.required : [])
      if (typeof key === 'string' && !Object.hasOwn(object, key)) invalid(path, 'Provide every required action input.');
    for (const [key, child] of Object.entries(object)) {
      if (!Object.hasOwn(properties, key) && shape.additionalProperties === false) invalid(path, 'Remove unknown action inputs.');
      staticInputTypes(child, own(properties, key), config, `${path}/${key}`, literal);
    }
  }
}
export async function compileConfiguration(input: unknown, dependencies: CompilerDependencies): Promise<Compilation> {
  const diagnostics: Diagnostic[] = [];
  const failure = (): Compilation => ({ schemaVersion: '1.0', ok: false, diagnostics });
  let config: Configuration;
  try { config = validated<Configuration>('config', input as Configuration); }
  catch {
    let issues: ReturnType<typeof validationIssues> = [];
    try { issues = validationIssues('config', JSON.parse(JSON.stringify(input))); } catch { /* Non-JSON input. */ }
    diagnostics.push(...(issues.length ? issues : [{ path: '/', keyword: 'json' }]).map(issue => ({
      code: 'configuration_invalid', path: issue.path, message: `Correct the installation schema (${issue.keyword}); unknown core keys are not accepted.`,
    })));
    return failure();
  }
  const capture = (path: string, error: unknown) => diagnostics.push({
    code: error instanceof ConfigurationError ? error.code : 'configuration_invalid', path,
    message: error instanceof ConfigurationError ? error.message : 'Verify the installed artifact, reference, schema, permission or capability.',
  });
  if (config.broker.enabled === false) {
    if (Object.values(config.workflows).flat().some(step => step.action === 'labstride.github-workflow') ||
      Object.values(config.targets).some(target => target.connector === 'labstride.github-workflow.connector'))
      capture('/broker', new ConfigurationError('unsupported_capability', '/broker', 'Workflow dispatch requires an enabled broker.'));
  } else try {
    const broker = new URL(config.broker.url);
    if (broker.protocol !== 'https:' || broker.username || broker.password || broker.hostname === 'example.invalid' || broker.hostname.endsWith('.example.invalid'))
      invalid('/broker/url', 'Configure a real credential-free HTTPS broker URL.');
  } catch { capture('/broker/url', new ConfigurationError('configuration_invalid', '/broker/url', 'Configure a real credential-free HTTPS broker URL.')); }
  let lock: ExtensionLock;
  try { lock = validated('extension-lock', dependencies.lock); }
  catch (error) { capture('/extensions', error); return failure(); }
  let host: HostProfile;
  try { host = structuredClone(dependencies.host); }
  catch (error) { capture('/extensions', error); return failure(); }
  const inspected = new Map<string, ReturnType<typeof inspectExtension>>();
  const pins = new Map(lock.extensions.map(pin => [pin.id, pin]));
  if (pins.size !== lock.extensions.length || new Set(config.extensions.map(pin => pin.id)).size !== config.extensions.length)
    capture('/extensions', new Error());
  if (lock.extensions.length !== config.extensions.length) capture('/extensions', new Error());
  for (const selected of config.extensions) {
    try {
      const pin = pins.get(selected.id);
      if (!pin || selected.version !== pin.version || selected.integrity !== pin.integrity) invalid('/extensions', 'Use exact installed extension identities, versions and integrity pins.');
      if (Object.hasOwn(config.extensionConfiguration, pin.id) && !sameConfiguration(config.extensionConfiguration[pin.id], pin.configuration))
        invalid('/extensionConfiguration', 'Keep extension configuration consistent with its reviewed lock pin.');
      inspected.set(pin.id, inspectExtension(pin, host));
    } catch (error) { capture('/extensions', error); }
  }
  for (const id of Object.keys(config.extensionConfiguration))
    if (!pins.has(id)) capture('/extensionConfiguration', new Error());
  const references = new Set<string>();
  function collect(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if ((key === 'credentialRef' || key === 'projectCredentialRef' || key === 'protectionCredentialRef') && (typeof item !== 'string' || !item.startsWith('secret:')))
        invalid('/secrets', 'Use an installation-owned secret reference.');
      if (typeof item === 'string' && item.startsWith('secret:')) references.add(item);
      else collect(item);
    }
  }
  try { collect(config); collect(lock); }
  catch (error) { capture('/secrets', error); }
  for (const ref of [...references].sort()) {
    try { if (await dependencies.secrets.exists(ref) !== true) invalid('/secrets', 'Provision every referenced secret before enablement.'); }
    catch (error) { capture('/secrets', error); }
  }
  const bindings: Record<string, ProviderBinding> = Object.create(null);
  for (const [name, field] of Object.entries(config.fields)) {
    try {
      const credential = field.source === 'project_v2' ? config.github.projectCredentialRef : config.github.credentialRef;
      const { displayName: _displayName, optionNames: _optionNames, ...description } = await dependencies.provider.describeField(structuredClone(field), credential);
      const binding = validated<ProviderBinding>('provider-binding', description);
      binding.optionIds.sort(); binding.operators.sort(); binding.evidenceRefs.sort();
      if (!pins.has(binding.providerId) || pins.get(binding.providerId)!.kind !== 'provider' || !inspected.has(binding.providerId) ||
        binding.credentialRef !== credential || binding.source !== field.source || binding.scopeId !== field.scopeId || binding.fieldId !== field.fieldId || binding.type !== field.type)
        invalid(`/fields/${name}`, 'Refresh this binding using the selected credential and stable provider/container/field identity.');
      if (!binding.readable) throw new ConfigurationError('unsupported_capability', `/fields/${name}`, 'Qualify readable access for this binding.');
      if (!['single-select','multi-select'].includes(field.type) && Object.keys(field.options ?? {}).length)
        invalid(`/fields/${name}`, 'Only select fields may declare option mappings.');
      const options = Object.values(field.options ?? {});
      if (new Set(options).size !== options.length || options.some(id => !binding.optionIds.includes(id)))
        invalid(`/fields/${name}`, 'Resolve distinct existing option IDs before enablement.');
      bindings[name] = binding;
    } catch (error) { capture(`/fields/${name}`, error); }
  }
  for (const [name, target] of Object.entries(config.targets)) {
    try {
      if (pins.get(target.connector)?.kind !== 'connector') invalid(`/targets/${name}`, 'Pin an installed connector for this target.');
      const connector = inspected.get(target.connector);
      if (!connector) invalid(`/targets/${name}`, 'Verify the target connector.');
      connector.check('configuration', target.configuration);
    } catch (error) { capture(`/targets/${name}`, error); }
  }
  for (const [name, steps] of Object.entries(config.workflows)) {
    try {
      if (new Set(steps.map(s => s.id)).size !== steps.length) invalid(`/workflows/${name}`, 'Use unique step IDs in each workflow.');
      for (const step of steps) {
        const action = inspected.get(step.action);
        if (!action || pins.get(step.action)?.kind !== 'action') invalid(`/workflows/${name}`, 'Select an installed action ID; input data cannot install operations.');
        visitBindings(step.inputs, config, `/workflows/${name}/${step.id}/inputs`);
        staticInputTypes(step.inputs, action.artifact.schemas[action.artifact.manifest.inputSchema], config, `/workflows/${name}/${step.id}/inputs`);
        if (Object.hasOwn(step.inputs, 'target') && (typeof step.inputs.target !== 'string' || !own(config.targets, step.inputs.target)))
          invalid(`/workflows/${name}`, 'Select the target with a configured literal target ID.');
        if (!hasDynamicBinding(step.inputs)) action.check(action.artifact.manifest.inputSchema, unwrapLiterals(step.inputs));
      }
    } catch (error) { capture(`/workflows/${name}`, error); }
  }
  const signatures = new Set<string>(), ruleIds = new Set<string>();
  for (const rule of config.rules) {
    try {
      if (ruleIds.has(rule.id)) invalid(`/rules/${rule.id}`, 'Use unique rule IDs.'); ruleIds.add(rule.id);
      if (!(dependencies.eventKinds ?? ['field.changed','run.completed']).includes(rule.event)) invalid(`/rules/${rule.id}`, 'Select an event supported by the installed observation adapter.');
      if (!own(config.workflows, rule.workflow)) invalid(`/rules/${rule.id}`, 'Configure the referenced workflow.');
      validateCondition(rule.condition, config, bindings, `/rules/${rule.id}/condition`);
      if (rule.event === 'field.changed' && !transitionRequired(rule.condition)) invalid(`/rules/${rule.id}`, 'Every start branch must require a positive changedTo transition.');
      const signature = canonical([rule.event, normalizedCondition(rule.condition)]);
      if (signatures.has(signature)) throw new ConfigurationError('rule_conflict', `/rules/${rule.id}`, 'Resolve duplicate matching conditions; rule ordering grants no precedence.');
      signatures.add(signature);
    } catch (error) { capture(`/rules/${rule.id}`, error); }
  }
  for (const [name, control] of Object.entries(config.controls)) {
    try {
      const field = own(config.fields, control.field);
      if (!field || !own(bindings, control.field)) invalid(`/controls/${name}`, 'Resolve the configured control field.');
      const yes = control.enabledValues.map(v => canonical(fieldValue(field, v, true)));
      const no = control.disabledValues.map(v => canonical(fieldValue(field, v, true)));
      if (yes.some(v => no.includes(v)) || new Set(yes).size !== yes.length || new Set(no).size !== no.length)
        invalid(`/controls/${name}`, 'Use distinct, disjoint enabled and disabled control values.');
    } catch (error) { capture(`/controls/${name}`, error); }
  }
  const projected = new Set<string>();
  for (const [index, projection] of config.projections.entries()) {
    try {
      const field = own(config.fields, projection.field), binding = own(bindings, projection.field);
      if (!field || !binding?.writable) throw new ConfigurationError('unsupported_capability', `/projections/${index}`, 'Qualify the configured writable projection field.');
      if(projection.valueFrom){
        if(field.type!=='string')invalid(`/projections/${index}`,'Registered resource outputs require a text field.');
        const source=projection.valueFrom;
        if(source.kind==='workspace-source-path'&&(!own(config.targets,source.targetId)||source.rootPath.split('/').some(part=>part==='.'||part==='..')||projection.fact!=='workspace.ready'))
          invalid(`/projections/${index}`,'Bind the ready workspace output to a configured target and exact protected root.');
        if(source.kind==='session-id'&&projection.fact!=='session.ready'){
          const managed=pins.get('labstride.self-build');
          if(projection.fact!=='self-build.session-ready'||!managed?.capabilities.includes('self-build.checked-delivery.v1')||
            !Object.values(config.workflows).some(steps=>steps.some(step=>step.action==='labstride.self-build')))
            invalid(`/projections/${index}`,'Project session IDs only from a registered ready session.');
        }
      }else fieldValue(field,projection.value!,true);
      const key = canonical([projection.fact, binding.providerId, binding.source, binding.scopeId, binding.fieldId]);
      if (projected.has(key)) invalid(`/projections/${index}`, 'Use one mapping per fact and external projection field.');
      projected.add(key);
    } catch (error) { capture(`/projections/${index}`, error); }
  }
  // A selected request field may also show disjoint managed progress. Every
  // alias and every rule predicate is checked; control fields cannot opt in.
  const predicates:{condition:Condition;positive:boolean}[]=[];
  function collectPredicates(c:Condition,positive=true):void {
    if ('field' in c) {predicates.push({condition:c,positive});return;}
    if ('not' in c) collectPredicates(c.not,false);else ('all' in c?c.all:c.any).forEach(child=>collectPredicates(child,positive));
  }
  config.rules.filter(rule=>rule.event==='field.changed').forEach(rule=>collectPredicates(rule.condition));
  const identity=(name:string)=>{const b=own(bindings,name);return b&&canonical([b.providerId,b.source,b.scopeId,b.fieldId]);};
  for(const projection of config.projections){
    const key=identity(projection.field);if(!key)continue;
    const controls=Object.values(config.controls).some(control=>identity(control.field)===key);
    const conditions=predicates.filter(({condition})=>'field' in condition&&identity(condition.field)===key);
    if(!controls&&!conditions.length)continue;
    const field=config.fields[projection.field];
    const safe=!controls&&field.allowManagedProgress===true&&field.type==='single-select'&&!projection.valueFrom&&conditions.every(({condition,positive})=>
      positive&&'field' in condition&&condition.op==='changedTo'&&canonical(fieldValue(config.fields[condition.field],condition.value,true))!==canonical(fieldValue(field,projection.value!,true)));
    if(!safe)capture('/projections',new ConfigurationError('configuration_invalid','/projections',
      'Keep controls separate; explicitly opt in to disjoint single-select request/progress values.'));
  }
  if (diagnostics.length) return failure();
  const contents = { schemaVersion: '1.0' as const, configuration: config, bindings, extensionLock: lock };
  let snapshot: ConfigurationSnapshot;
  try { snapshot = freeze(validated<ConfigurationSnapshot>('configuration-snapshot', { ...contents, digest: digest(contents) })); }
  catch (error) { capture('/', error); return failure(); }
  const configuration: CompiledConfiguration = Object.freeze({ snapshot,
    bindWorkflow: (workflow: string, fields: Record<string, { present: boolean; value?: Value }>, context: BindingContext) =>
      bindWorkflow(snapshot.configuration, snapshot.extensionLock.extensions, host, workflow, fields, context),
    bindStep: (workflow: string, stepId: string, fields: Record<string, { present: boolean; value?: Value }>, context: BindingContext) =>
      bindWorkflow(snapshot.configuration, snapshot.extensionLock.extensions, host, workflow, fields, context, stepId)[0],
  });
  compiled.set(configuration, snapshot);
  return { schemaVersion: '1.0', ok: true, diagnostics: [], configuration };
}
const sameConfiguration = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function normalizedCondition(condition: Condition): unknown {
  if ('all' in condition || 'any' in condition) {
    const key = 'all' in condition ? 'all' : 'any';
    return { [key]: ('all' in condition ? condition.all : condition.any).map(normalizedCondition).sort((a,b) => canonical(a).localeCompare(canonical(b))) };
  }
  if ('not' in condition) return { not: normalizedCondition(condition.not) };
  return condition;
}
function hasDynamicBinding(node: unknown): boolean {
  if (typeof node === 'string') return node.startsWith('context.');
  if (!node || typeof node !== 'object') return false;
  const object = node as Record<string, unknown>;
  if (object.binding === 'literal') return false;
  return object.binding === 'context' || object.binding === 'field' || Object.values(object).some(hasDynamicBinding);
}
function unwrapLiterals(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(unwrapLiterals);
  const object = node as Record<string, unknown>;
  if (object.binding === 'literal') return object.value;
  return Object.fromEntries(Object.entries(object).map(([k,v]) => [k, unwrapLiterals(v)]));
}
