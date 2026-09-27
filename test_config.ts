import { getPatchChain, compareSemVer } from './app/api/gtfs/config';

console.log('compareSemVer 1.0.0 1.0.5', compareSemVer('1.0.0', '1.0.5'));

// Mock getCatalogMap inside config if needed, or just see if getPatchChain throws error on empty DB.
const chain = getPatchChain('EG', 'cairo', '1.0.0');
console.log('Patch chain for EG cairo 1.0.0:', chain);
