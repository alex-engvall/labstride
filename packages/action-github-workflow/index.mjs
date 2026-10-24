// The coordinator supplies this reviewed port. No provider token enters the action payload.
export function createExtension(configuration, services) {
  if (!configuration.enrollments || !services?.workflow) throw Error('configuration_invalid');
  const port = services.workflow;
  return {
    validate: operation => port.validate(operation),
    start: operation => port.start(operation),
    reconcile: operation => port.reconcile(operation),
  };
}
