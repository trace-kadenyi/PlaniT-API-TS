import { IUser, IEvent, IExpense } from "../models/index";

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
