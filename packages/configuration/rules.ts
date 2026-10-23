import type { Condition } from '../../contracts/generated/config.ts';
import type { TrustedNormalizedFieldObservation } from '../../contracts/generated/rule-observation.ts';
import type { ConfigurationRuleEvaluation } from '../../contracts/generated/rule-evaluation.ts';
import type { ConfigurationSnapshot } from './snapshot.ts';
import { checkedSnapshot } from './snapshot.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { fieldValue, own, same } from './values.ts';

export type RuleObservation = TrustedNormalizedFieldObservation;
export type RuleEvaluation = ConfigurationRuleEvaluation;
export function evaluateRules(inputSnapshot: ConfigurationSnapshot, input: RuleObservation): RuleEvaluation {
  const result = (outcome: RuleEvaluation['outcome'], code: RuleEvaluation['code'], ruleIds: string[] = [], workflow: string | null = null): RuleEvaluation =>
    validated('rule-evaluation', { schemaVersion: '1.0', outcome, code, ruleIds, workflow });
  let observation: RuleObservation, snapshot: ConfigurationSnapshot;
  try { snapshot = checkedSnapshot(inputSnapshot); observation = validated('rule-observation', input); }
  catch { return result('blocked', 'invalid_observation'); }
  const config = snapshot.configuration;
  if (observation.event.installationId !== config.installationId || observation.configDigest !== snapshot.digest) return result('blocked', 'invalid_observation');
  if (!config.enabled) return result('no_match', 'disabled');
  if (observation.initialSync) return result('no_match', 'initial_sync');
  if (observation.event.kind === 'field.changed' && observation.event.origin !== 'human') return result('no_match', 'non_human_origin');
  let transitionChanged = false;
  function conditionMatches(condition: Condition): boolean {
    // Evaluate every child so invalid values cannot be hidden by short circuiting/not.
    if ('all' in condition) return condition.all.map(conditionMatches).every(Boolean);
    if ('any' in condition) return condition.any.map(conditionMatches).some(Boolean);
    if ('not' in condition) return !conditionMatches(condition.not);
    const field = own(config.fields, condition.field), binding = own(snapshot.bindings, condition.field);
    if (!field || !binding || (observation.event.kind === 'field.changed' && observation.event.provider !== binding.providerId)) throw new Error();
    const current = own(observation.current, condition.field);
    if (!current) throw new Error(); // Unobserved differs from a confirmed absent value.
    const value = current.present ? fieldValue(field, current.value) : undefined;
    if (condition.op === 'exists') return current.present;
    if (condition.op === 'changedTo') {
      const previous = own(observation.previous, condition.field);
      if (!previous) throw new Error();
      const before = previous.present ? fieldValue(field, previous.value) : undefined;
      if (!current.present || same([previous.present,before ?? null], [current.present,value ?? null])) return false;
      transitionChanged = true;
      return same(value, fieldValue(field, condition.value, true));
    }
    // Missing is not unequal-to every literal. Explicit null remains comparable.
    if (!current.present) return false;
    if (condition.op === 'contains') {
      const expected = fieldValue(field.type === 'multi-select' ? { ...field, type: 'single-select' } : field, condition.value, true);
      return typeof value === 'string' && typeof expected === 'string' ? value.includes(expected) : Array.isArray(value) && typeof expected === 'string' && value.includes(expected);
    }
    const equal = same(value, fieldValue(field, condition.value, true));
    return condition.op === 'equals' ? equal : !equal;
  }
  try {
    const candidates = config.rules.filter(rule => rule.event === observation.event.kind);
    const matches = candidates.map(rule => ({ rule, matches: conditionMatches(rule.condition) })).filter(entry => entry.matches).map(entry => entry.rule);
    if (matches.length > 1) return result('rule_conflict', 'rule_conflict', matches.map(rule => rule.id));
    if (!matches.length) return result('no_match', observation.event.kind === 'field.changed' && !transitionChanged ? 'unchanged' : 'no_match');
    return result('matched', 'matched', [matches[0].id], matches[0].workflow);
  } catch { return result('blocked', 'invalid_value'); }
}
