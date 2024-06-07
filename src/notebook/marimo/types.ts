import type { components, paths } from "../../generated/api";

export type TypedString<T> = string & { __type__: T };

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
export type InstallMissingPackagesRequest = schemas["InstallMissingPackagesRequest"];
export type RunRequest = schemas["RunRequest"];
export type DeleteRequest = schemas["DeleteRequest"];
export type CellChannel = schemas['CellChannel'];
export type FunctionCallRequest = schemas['FunctionCallRequest'];
export type MarimoConfig = schemas['MarimoConfig'];

export type CellOp = MessageOperationData<"cell-op">;;
export type KernelReady = MessageOperationData<'kernel-ready'>;;
export type FunctionCallResult = MessageOperationData<'function-call-result'>;;
