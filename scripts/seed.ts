import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { seedSamples } from '../lib/seed';

seedSamples()
  .then((n) => console.log(`Seeded ${n} sample candidates.`))
  .catch((e) => {
    console.error('Seed failed:', e.message);
    process.exit(1);
  });
