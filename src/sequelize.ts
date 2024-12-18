import {
  Sequelize,
  Model,
  Table,
  DataType,
  Column,
  BelongsTo,
  HasOne,
  HasMany,
} from "sequelize-typescript";
import { getLogger } from "./logger";
import { LatLngArr, WatchedShowData } from "./models";

const logger = getLogger(__filename);

const ensureJson = (dataValue: any) =>
  typeof dataValue === "string" ? JSON.parse(dataValue) : dataValue;

/** Converts periods and plus symbols into spaces, and removes `:/` sequences. */
export const sanitiseShowName = (showName: string) =>
  showName.replace(/[.+]/g, " ").replace(/:\//g, "").trim();

@Table({})
export class Page extends Model {
  @Column({ primaryKey: true, autoIncrement: true })
  id!: number;
  @Column({ allowNull: false, field: "title_en" })
  titleEN!: string;
  @Column({ allowNull: false, field: "title_pl" })
  titlePL!: string;
  @Column({ allowNull: false })
  url!: string;
  @Column({ field: "local_url", allowNull: false })
  localUrl!: boolean;
  @Column({ field: "admin_only", allowNull: false })
  adminOnly!: boolean;
  @Column({ field: "should_fetch", allowNull: false })
  shouldFetch!: boolean;
}

@Table({
  // `tableName` defaults to "page_contents"
  tableName: "page_content",
})
export class PageContent extends Model {
  @Column({ allowNull: false, field: "content_en" })
  contentEN!: string;
  @Column({ allowNull: false, field: "content_pl" })
  contentPL!: string;

  @BelongsTo(() => Page, { foreignKey: "page_id" })
  page!: Page;
}

@Table({ timestamps: true, updatedAt: "modified_at" })
export class User extends Model {
  @Column({
    type: DataType.STRING(36),
    allowNull: false,
    unique: true,
    primaryKey: true,
  })
  uuid!: string;
  @Column({ type: DataType.STRING(64), allowNull: false })
  username!: string;
  @Column({ allowNull: false })
  email!: string;
  @Column({ allowNull: false })
  hash!: string;
  @Column({ allowNull: false })
  salt!: string;
  @Column({ defaultValue: false })
  admin!: boolean;
  @HasOne(() => UserShows, { foreignKey: "user_uuid" })
  userShows!: UserShows | null;
  @HasOne(() => WatchedEpisodes, { foreignKey: "user_uuid" })
  watchedEpisodes!: WatchedEpisodes | null;
  @HasMany(() => TuLalem, { foreignKey: "user_uuid" })
  tuLalem!: TuLalem[];
}

@Table({ timestamps: true, updatedAt: false })
export class Token extends Model {
  @Column({ allowNull: false, primaryKey: true })
  value!: string;
}

@Table({
  // `tableName` defaults to "updateds"
  tableName: "updated",
})
export class Updated extends Model {
  @Column({ allowNull: false })
  endpoint!: string;
  @Column({ allowNull: false })
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
  @Column({
    allowNull: false,
    type: DataType.GEOMETRY("POINT"),
    get() {
      const coords = this.getDataValue("coordinates").coordinates;
      const [lng, lat] = coords;
      return [lat, lng];
    },
  })
  coordinates!: LatLngArr;
  @BelongsTo(() => User, { foreignKey: "user_uuid" })
  user!: User;
}

@Table({})
export class UserShows extends Model {
  @Column({ allowNull: false, field: "user_uuid", primaryKey: true })
  userUUID!: string;
  @Column({
    allowNull: false,
    field: "liked_shows",
    type: DataType.JSON,
    get() {
      return ensureJson(this.getDataValue("liked_shows"));
    },
  })
  likedShows!: number[];
  @Column({
    allowNull: false,
    field: "subscribed_shows",
    type: DataType.JSON,
    get() {
      return ensureJson(this.getDataValue("subscribed_shows"));
    },
  })
  subscribedShows!: number[];
  @BelongsTo(() => User, { foreignKey: "user_uuid" })
  user!: User;
}

@Table({})
export class WatchedEpisodes extends Model {
  @Column({ allowNull: false, field: "user_uuid", primaryKey: true })
  userUUID!: string;
  @Column({
    allowNull: false,
    field: "watched_episodes",
    type: DataType.JSON,
    get() {
      return ensureJson(this.getDataValue("watched_episodes"));
    },
  })
  watchedEpisodes!: WatchedShowData;
  @BelongsTo(() => User, { foreignKey: "user_uuid" })
  user!: User;
}

@Table({})
export class DownloadedEpisode extends Model {
  @Column({ primaryKey: true, autoIncrement: true })
  id!: number;
  @Column({ allowNull: false, field: "show_id" })
  showId!: number;
  @Column({
    allowNull: false,
    field: "show_name",
    set(value: string) {
      this.setDataValue("show_name", sanitiseShowName(value));
    },
  })
  showName!: string;
  @Column({ allowNull: false })
  season!: number;
  @Column({ allowNull: false })
  episode!: number;
}

export function initialiseSequelize(
  debugMode: boolean,
  isDecentralised: boolean = false
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
  sequelize
    .authenticate()
    .then(() => logger.debug("Database connection established"))
    .catch((error) => logger.error("Error connecting to the database:", error));

  // Sync models (if needed)
  if (debugMode) {
    sequelize.sync();
  }
}
