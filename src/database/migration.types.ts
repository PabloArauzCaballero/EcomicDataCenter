import type { Sequelize } from 'sequelize';

export interface MigrationContext {
  context: {
    sequelize: Sequelize;
  };
}
