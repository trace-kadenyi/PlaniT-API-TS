import { IUser, IEvent, IExpense } from "../models";

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      targetUser?: IUser;
      targetEvent?: IEvent;
      targetExpense?: IExpense;
    }
  }
}

export {};
