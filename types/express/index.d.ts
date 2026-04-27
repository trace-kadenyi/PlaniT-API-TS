import { IUser, IEvent, IExpense } from "../models";

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      targetUser?: IUser | { role: string };
      targetEvent?: IEvent;
      targetExpense?: IExpense;
    }
  }
}

export {};
