import { companyRegistry, canonicalCompanyKey } from '../src/data/company-registry.js';
import { companySourceSeeds } from '../src/data/company-source-seeds.js';

if (!companySourceSeeds.length) throw new Error('company recruitment seed registry is empty');

const names = new Set();
const urls = new Set();
const errors = [];
for (const seed of companySourceSeeds) {
  if (!seed?.company || !/^https:\/\//.test(seed?.url || '')) {
    errors.push(`invalid seed: ${seed?.company || '(missing company)'}`);
    continue;
  }
  const nameKey = canonicalCompanyKey(seed.company);
  if (!nameKey || names.has(nameKey)) errors.push(`duplicate seed company: ${seed.company}`);
  if (urls.has(seed.url)) errors.push(`duplicate seed URL: ${seed.url}`);
  names.add(nameKey); urls.add(seed.url);

  const match = companyRegistry.find((record) => {
    const key = canonicalCompanyKey(record.name);
    return key === nameKey || (Math.min(key.length, nameKey.length) >= 3 && (key.includes(nameKey) || nameKey.includes(key)));
  });
  if (!match) {
    errors.push(`not in unified registry: ${seed.company}`);
    continue;
  }
  if (!['主投', '观察'].includes(match.status)) errors.push(`inactive seed target: ${seed.company} -> ${match.name} (${match.status})`);
  if (match.careerUrl !== seed.url && !match.userRequested) errors.push(`seed not attached: ${seed.company} -> ${match.name}`);
}

if (errors.length) throw new Error(`Recruitment seed validation failed:\n- ${errors.join('\n- ')}`);
console.log(`Company recruitment seed checks passed: ${companySourceSeeds.length} deterministic official-entry candidates.`);
