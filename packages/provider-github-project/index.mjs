export function createExtension(configuration, services) {
  if (Object.keys(configuration).length || !services?.githubReader) throw Error("configuration_invalid");
  return services.githubReader;
}
