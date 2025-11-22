import { seedAdminDashboardDefaults } from '../services/adminDashboardService.js';

const run = async (): Promise<void> => {
  try {
    const result = await seedAdminDashboardDefaults();
    console.log(
      `Admin dashboard defaults seeded. Settings: ${result.createdSettings}, prompts: ${result.createdPromptProfiles}, agents: ${result.createdAgents}`,
    );
    process.exit(0);
  } catch (error) {
    console.error('Failed to seed admin dashboard defaults', error);
    process.exit(1);
  }
};

void run();
