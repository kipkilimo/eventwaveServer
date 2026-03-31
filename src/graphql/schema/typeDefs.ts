import { gql } from "graphql-tag";
import { baseTypeDefs } from "./baseTypeDefs";

import { userTypeDefs } from "./user";
import { organizationTypeDefs } from "./organization";
import { eventTypeDefs } from "./event";
import { pollTypeDefs } from "./poll";
import { testTypeDefs } from "./test"; // ✅ ensure this is imported
import { livefeedTypeDefs } from "./livefeed";
import { qnaTypeDefs } from "./qna";
import { mediaTypeDefs } from "./media";
import { feedbackTypeDefs } from "./feedback";
import { chatTypeDefs } from "./chat";
import { invoiceTypeDefs } from "./invoice";
import { paymentTypeDefs } from "./payment";

export const typeDefs = [
  baseTypeDefs,
  userTypeDefs,
  organizationTypeDefs,
  eventTypeDefs,
  pollTypeDefs,
  testTypeDefs, // ✅ MUST be included here
  livefeedTypeDefs,
  qnaTypeDefs,
  mediaTypeDefs,
  feedbackTypeDefs,
  chatTypeDefs,
  invoiceTypeDefs,
  paymentTypeDefs,
];
