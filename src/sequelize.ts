import {
  Sequelize,
  Model,
  Table,
  DataType,
  Column,
  BelongsTo,
  HasOne,
  HasMany,
  ForeignKey,
} from "sequelize-typescript";
import { getLogger } from "./logger";
import { LatLngArr, WatchedShowData } from "./models";
import { ModelAttributeColumnOptions } from "sequelize";

const logger = getLogger(__filename);

/** Converts periods and plus symbols into spaces, and removes `:/` sequences. */
export const sanitiseShowName = (showName: string) =>
  showName.replace(/[.+]/g, " ").replace(/:\//g, "").trim();

/** This is NEEDED when using MariaDB, as Sequelize reads DataType.JSON fields as strings */
const getJson = (value: string) =>
  typeof value === "string" ? JSON.parse(value) : value;

// Custom decorator to enforce allowNull: false by default
function NotNull(options: Partial<ModelAttributeColumnOptions> = {}) {
  return Column({
    allowNull: false, // Default value
    ...options, // Override defaults if explicitly specified
  });
}

@Table({})
export class Page extends Model {
  @NotNull({ primaryKey: true, autoIncrement: true })
  id!: number;
  @NotNull()
  titleEn!: string;
  @NotNull()
  titlePl!: string;
  @NotNull()
  url!: string;
  @NotNull()
  localUrl!: boolean;
  @NotNull()
  adminOnly!: boolean;
  @NotNull()
  shouldFetch!: boolean;
}

@Table({
  // `tableName` defaults to "page_contents"
  tableName: "page_content",
})
export class PageContent extends Model {
  @ForeignKey(() => Page)
  @NotNull({ primaryKey: true })
  pageId!: number;
  @NotNull()
  contentEn!: string;
  @NotNull()
  contentPl!: string;
  @BelongsTo(() => Page)
  page!: Page;
}

@Table({ timestamps: true, updatedAt: "modified_at", createdAt: "created_at" })
export class User extends Model {
  @NotNull({
    unique: true,
    primaryKey: true,
  })
  uuid!: string;
  @NotNull()
  username!: string;
  @NotNull()
  email!: string;
  @NotNull()
  hash!: string;
  @NotNull()
  salt!: string;
  @NotNull({ defaultValue: false })
  admin!: boolean;
  @NotNull({ defaultValue: "" })
  serverUrl!: string;
  @HasOne(() => UserShows, { foreignKey: "user_uuid" })
  userShows!: UserShows | null;
  @HasOne(() => WatchedEpisodes, { foreignKey: "user_uuid" })
  watchedEpisodes!: WatchedEpisodes | null;
  @HasMany(() => TuLalem, { foreignKey: "user_uuid" })
  tuLalem!: TuLalem[];
}

@Table({ timestamps: true, updatedAt: false })
export class Token extends Model {
  @NotNull({ primaryKey: true })
  value!: string;
}

@Table({
  // `tableName` defaults to "updateds"
  tableName: "updated",
})
export class Updated extends Model {
  @NotNull()
  endpoint!: string;
  @NotNull()
  timestamp!: number;
}

@Table({
  // `tableName` defaults to "tu_lalems"
  tableName: "tu_lalem",
  timestamps: true,
  createdAt: "timestamp",
  updatedAt: false,
})
export class TuLalem extends Model {
  @ForeignKey(() => User)
  @NotNull({ primaryKey: true })
  userUuid!: string;
  @NotNull({
    type: DataType.GEOMETRY("POINT"),
    get() {
      const coords = this.getDataValue("coordinates").coordinates;
      const [lng, lat] = coords;
      return [lat, lng];
    },
  })
  coordinates!: LatLngArr;
  @BelongsTo(() => User)
  user!: User;
}

@Table({})
export class UserShows extends Model {
  @ForeignKey(() => User)
  @NotNull({ primaryKey: true })
  userUuid!: string;
  @NotNull({
    type: DataType.JSON,
    get() {
      return getJson(this.getDataValue("likedShows"));
    },
  })
  likedShows!: number[];
  @NotNull({
    type: DataType.JSON,
    get() {
      return getJson(this.getDataValue("subscribedShows"));
    },
  })
  subscribedShows!: number[];
  @BelongsTo(() => User)
  user!: User;
}

@Table({})
export class WatchedEpisodes extends Model {
  @ForeignKey(() => User)
  @NotNull({ primaryKey: true })
  userUuid!: string;
  @NotNull({
    type: DataType.JSON,
    get() {
      return getJson(this.getDataValue("watchedEpisodes"));
    },
  })
  watchedEpisodes!: WatchedShowData;
  @BelongsTo(() => User)
  user!: User;
}

@Table({})
export class DownloadedEpisode extends Model {
  @NotNull({ primaryKey: true, autoIncrement: true })
  id!: number;
  @NotNull()
  showId!: number;
  @NotNull({
    set(value: string) {
      this.setDataValue("showName", sanitiseShowName(value));
    },
  })
  showName!: string;
  @NotNull()
  season!: number;
  @NotNull()
  episode!: number;
}

export async function initialiseSequelize(
  debugMode: boolean,
  isDecentralised: boolean
) {
  const session = {
    host: process.env.MY_SQL_DB_HOST ?? "127.0.0.1",
    port: process.env.MY_SQL_DB_PORT ?? "3306",
    user: process.env.MY_SQL_DB_USER ?? "root",
    password: process.env.MY_SQL_DB_PASSWORD,
    database: process.env.MY_SQL_DB_NAME ?? "database",
    // connectionLimit: parseInt(process.env.MY_SQL_DB_CONNECTION_LIMIT ?? "4"),
  };

  const sequelize = new Sequelize(
    session.database,
    session.user,
    session.password,
    {
      host: session.host,
      dialect: "mysql",
      logging: debugMode && console.log,
      models: isDecentralised
        ? [DownloadedEpisode]
        : [
            Page,
            PageContent,
            User,
            Token,
            Updated,
            TuLalem,
            UserShows,
            WatchedEpisodes,
          ],
      define: {
        underscored: true,
        timestamps: false,
      },
    }
  );

  // Establish the database connection
  try {
    await sequelize.authenticate();
  } catch (error) {
    logger.error("Could not connect to the database:", error);
    return error as Error;
  }

  logger.debug("Database connection established successfully.");

  // Sync models (if needed)
  if (debugMode) {
    await sequelize.sync();
  }
  return null;
}
