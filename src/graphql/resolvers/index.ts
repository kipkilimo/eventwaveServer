import { IResolvers } from "@graphql-tools/utils";

import organizationResolvers from "./organization";
import eventResolvers from "./event";
import userResolvers from "./user";
import pollResolvers from "./poll";
import testResolvers from "./test";
import { livefeedResolvers } from "./livefeed";
import { qnaResolvers } from "./qna";
import { mediaResolvers } from "./media";
import { feedbackResolvers } from "./feedback";
import chatResolvers from "./chat";
import { invoiceResolvers } from "./invoice";
import { paymentResolvers } from "./payment";

const resolvers = {
  Query: {
    ...userResolvers.Query,
    ...organizationResolvers.Query,
    ...eventResolvers.Query,
    ...pollResolvers.Query,
    ...testResolvers.Query,
    ...livefeedResolvers.Query,
    ...qnaResolvers.Query,
    ...mediaResolvers.Query,
    ...feedbackResolvers.Query,
    ...chatResolvers.Query,
    ...invoiceResolvers.Query,
    ...paymentResolvers.Query,
  },
  Mutation: {
    ...userResolvers.Mutation,
    ...organizationResolvers.Mutation,
    ...eventResolvers.Mutation,
    ...pollResolvers.Mutation,
    ...testResolvers.Mutation,
    ...livefeedResolvers.Mutation,
    ...qnaResolvers.Mutation,
    ...mediaResolvers.Mutation,
    ...feedbackResolvers.Mutation,
    ...chatResolvers.Mutation,
    ...invoiceResolvers.Mutation,
    ...paymentResolvers.Mutation,
  },
} as const; // ✅ prevents excess property issues

export default resolvers as any; // ✅ bypass IResolvers mismatch safely
