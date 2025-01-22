import type { Request, Response } from "express";
import type {
  Attributes,
  FindOptions,
  Identifier,
  InferCreationAttributes,
  Model,
  ModelStatic,
  WhereOptions,
} from "sequelize";
import type { MakeNullishOptional } from "sequelize/lib/utils";
import { getLogger } from "./logger";
import { sendError, sendOK } from "./http";
import { updateEndpoint } from "./util";

const logger = getLogger(__filename);

const isResponse = (res: any): res is Response =>
  res?.status && typeof res.status === "function";

/** Creates a new database entry in the database table model derivative provided.
 *  Sends a response containing the created data, unless `sendMethod` is specified.
 *  Returns `true` if the operation succeeded, else `false` if a 500 response was sent.
 */
export async function createDatabaseEntry<T extends Model>(
  model: ModelStatic<T>,
  modelParams: MakeNullishOptional<InferCreationAttributes<T>>,
  res?: Response,
  sendMethod?: (resp: Response, data: any, code: number) => void
) {
  let obj;
  try {
    obj = await model.create(modelParams);
  } catch (error) {
    if ((error as Error).name === "SequelizeUniqueConstraintError")
      if (res)
        sendError(res, 400, {
          message: "Cannot create duplicate entries.",
        });
    logger.error("Error while creating database entry:", error);
    if (res) sendError(res, 500, error as Error);
    return false;
  }
  await updateEndpoint(model);
  if (res) (sendMethod ?? sendOK)(res, obj, 201);
  return true;
}

/** Retrieves all entries in the database table model derivative provided. */
export async function readAllDatabaseEntries<T extends Model>(
  model: ModelStatic<T>,
  res: Response,
  callback?: (data: T[]) => void
) {
  let objs;
  try {
    objs = await model.findAll();
  } catch (error) {
    return void sendError(res, 500, error as Error);
  }
  if (callback) {
    callback(objs);
  } else {
    sendOK(res, objs);
  }
}

const isErrorCallback = (
  onError?: OnError
): onError is (error: Error) => void => typeof onError === "function";

type OnError = ((error: Error) => void) | Response;

/**
 * Retrieves all entries in the database which match the query and returns the array.
 * @param model the model instance to query
 * @param where the values to search for, e.g. { id: 1 }
 * @param onError the `Response` to which to send HTTP 500 if an error occurs, or a callback function to call when `findAll` fails.
 * If provided, the function will return `null` on error, othwerwies it will silently return an empty array on error.
 * @param allowEmptyResults if true, this will also call `onError` if the query returns no results (default: `false`)
 */
export async function queryDatabase<
  T extends Model,
  Y extends [] | [OnError] | [OnError, boolean]
>(
  model: ModelStatic<T>,
  query: FindOptions<Attributes<T>>,
  ...[onError, allowEmptyResults]: Y
): Promise<T[] | null>;
export async function queryDatabase<T extends Model>(
  model: ModelStatic<T>,
  query: FindOptions<Attributes<T>>,
  onError?: OnError,
  allowEmptyResults: boolean = false
): Promise<T[] | null> {
  let objs;
  try {
    objs = await model.findAll(query);
    if (objs.length === 0 && !allowEmptyResults) {
      throw Error("The database query returned no results.");
    }
  } catch (error) {
    if (isResponse(onError)) {
      sendError(onError, 500, error as Error);
      return null;
    }
    if (isErrorCallback(onError)) {
      onError(error as Error);
      return null;
    }
    return [];
  }
  return objs;
}

export const findUnique = <T extends Model>(
  model: ModelStatic<T>,
  primaryKey?: Identifier
) => (primaryKey ? model.findByPk(primaryKey) : null);

/** Updates the entry with the request payload in the database table model derivative provided.
 *  Sends back a response containing the number of affected rows.
 */
export async function updateDatabaseEntry<T extends Model>(
  model: ModelStatic<T>,
  req: Request,
  res: Response,
  modelParams?: Record<string, any>,
  where?: WhereOptions
) {
  let result: [affectedCount: number];
  where ??= req.params;
  modelParams ??= req.body;
  if (!modelParams)
    return void sendError(res, 400, {
      message: "Model parameters must be specified in request body.",
    });
  try {
    result = await model.update(modelParams, { where });
  } catch (error) {
    return void sendError(res, 500, error as Error);
  }
  const affectedRows = result[0];
  await updateEndpoint(model);
  return sendOK(res, { affectedRows });
}

/** Deletes the specified entry from the database table model derivative provided.
 *  Sends back a response containing the number of destroyed rows.
 */
export async function deleteDatabaseEntry<T extends Model>(
  model: ModelStatic<T>,
  where: WhereOptions,
  res?: Response
) {
  let destroyedRows: number;
  try {
    destroyedRows = await model.destroy({ where });
  } catch (error) {
    if (!res) throw error;
    return void sendError(res, 500, error as Error);
  }
  await updateEndpoint(model);
  if (res) {
    sendOK(res, { destroyedRows });
  }
  return destroyedRows;
}
