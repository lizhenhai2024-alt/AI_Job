import { companyRegistry, canonicalCompanyKey } from '../src/data/company-registry.js';
import { companySourceSeeds } from '../src/data/company-source-seeds.js';

if (!companySourceSeeds.length) throw new Error('company recruitment seed registry is empty');

const names = new Set();
const urls = new Set();
for (const seed of companySourceSeeds) {
  if (!seed?.company || !/^https:\/\//.test(seed?.url || '')) throw new Error(`invalid recruitment seed: ${seed?.company || '(missing company)'}`);
  const nameKey = canonicalCompanyKey(seed.company);
  if (!nameKey || names.has(nameKey)) throw new Error(`duplicate recruitment seed company: ${seed.company}`);
  if (urls.has(seed.url)) throw new Error(`duplicate recruitment seed URL: ${seed.url}`);
  names.add(nameKey); urls.add(seed.url);

  const match = companyRegistry.find((record) => {
    const key = canonicalCompanyKey(record.name);
    return key === nameKey || (Math.min(key.length, nameKey.length) >= 3 && (key.includes(nameKey) || nameKey.includes(key)));
  });
  if (!match) throw new Error(`recruitment seed company is not in unified registry: ${seed.company}`);
  if (!['主投', '观察'].includes(match.status)) throw new Error(`recruitment seed must target an active company: ${seed.company} (${match.status})`);
  if (match.careerUrl !== seed.url && !match.userRequested) throw new Error(`recruitment seed was not attached to company registry: ${seed.company}`);
}

console.log(`Company recruitment seed checks passed: ${companySourceSeeds.length} deterministic official-entry candidates.`);
