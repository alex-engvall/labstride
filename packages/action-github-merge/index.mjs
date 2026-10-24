// The trusted coordinator owns credentials, policy and durable intent.
export function createExtension(configuration, services) {
  if (!configuration.enrollments || !services?.merge) throw Error('configuration_invalid');
  return services.merge;
}
