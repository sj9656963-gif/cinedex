import { generateFixtures } from './fixtures';

export default async function globalSetup() {
  await generateFixtures();
}
