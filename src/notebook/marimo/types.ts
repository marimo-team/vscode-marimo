import type { components } from "../../generated/api";
import type { TypedString } from "../../utils/TypedString";
import type { DeepPartial } from "../../utils/types";

const lowercase = "abcdefghijklmnopqrstuvwxyz";
const uppercase = lowercase.toUpperCase();
const alphabet = lowercase + uppercase;

/**
 * A typed CellId
 */
export type CellId = TypedString<"CellId">;
export const CellId = {
  /**
   * Create a new CellId, a random 4 letter string.
   */
  create(): CellId {
    let id = "";
    for (let i = 0; i < 4; i++) {
      id += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return id as CellId;
  },
};

export type SessionId = TypedString<"SessionId">;
export const SessionId = {
  create(): SessionId {
    let id = "";
    for (let i = 0; i < 4; i++) {
      id += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return id as SessionId;
  },
};

export type SkewToken = TypedString<"SkewToken">;

type schemas = components["schemas"];

export type MessageOperationType = schemas["MessageOperation"]["name"];
export type MessageOperation = {
  [Type in MessageOperationType]: {
    op: Type;
    data: Omit<Extract<schemas["MessageOperation"], { name: Type }>, "name">;
  };
}[MessageOperationType];
export type MessageOperationData<T extends MessageOperationType> = Omit<
  Extract<schemas["MessageOperation"], { name: T }>,
  "name"
>;

export type CellStatus = schemas["CellStatus"];
export type Operation = schemas["MessageOperation"];
export type InstantiateRequest = schemas["InstantiateRequest"];
export type InstallMissingPackagesRequest =
  schemas["InstallMissingPackagesRequest"];
export type UpdateCellIdsRequest = schemas["UpdateCellIdsRequest"];
export type RunRequest = schemas["RunRequest"];
export type WorkspaceFilesResponse = schemas["WorkspaceFilesResponse"];
export type DeleteCellRequest = schemas["DeleteCellRequest"];
export type SaveNotebookRequest = schemas["SaveNotebookRequest"];
export type CellChannel = schemas["CellChannel"];
export type FunctionCallRequest = schemas["FunctionCallRequest"];
export type CellConfig = schemas["CellConfig"];
export type CellOutput = schemas["CellOutput"];
export type MarimoConfig = DeepPartial<schemas["MarimoConfig"]>;

export type CellOp = MessageOperationData<"cell-op">;
export type KernelReady = MessageOperationData<"kernel-ready">;
export type FunctionCallResult = MessageOperationData<"function-call-result">;
