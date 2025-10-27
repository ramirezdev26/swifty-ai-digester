import { Sequelize } from 'sequelize';
import { config } from './env.js';

const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: 'postgres',
    logging: config.server.nodeEnv === 'development' ? console.log : false,
    define: {
      timestamps: true,
      underscored: true,
    },
  }
);

export default sequelize;
