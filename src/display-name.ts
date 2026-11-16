// Databases provisioned before LT-561 store these exact seeded names, and provisioning
// never rewrites existing users. Display drops the qualifier only for the exact
// account and exact legacy name; every other name, including look-alikes, is shown as stored.
const legacySeedNames: Readonly<Record<string, readonly [string, string]>> = {
  alice: ["Alex · demo learner", "Alex"],
  bob: ["Sam · demo learner", "Sam"],
  instructor: ["Morgan · demo instructor", "Morgan"],
  outsider: ["Outside participant · demo", "Outside participant"],
};

export function displayName(id: string, name: string): string {
  const seed = Object.hasOwn(legacySeedNames, id)
    ? legacySeedNames[id]
    : undefined;
  return seed && seed[0] === name ? seed[1] : name;
}
