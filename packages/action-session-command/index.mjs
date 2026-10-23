// The installed action forwards only to the reviewed, profile-bound command
// service. JSON configuration cannot construct the trusted runtime port.
export function createExtension(configuration, services) {
  if(Object.keys(configuration).length || !services?.sessionAction)throw Error('configuration_invalid');
  return services.sessionAction;
}
