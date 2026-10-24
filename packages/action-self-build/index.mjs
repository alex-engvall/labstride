export function createExtension(configuration, services) {
  if (!services?.selfBuild) throw Error("configuration_invalid");
  return services.selfBuild(configuration);
}
