import { Chat } from "../../models/Chat";
import { requireAuth, canCreateResource } from "../../utils/auth";

const Query = {
  eventChats: async (_: any, { eventId }: any) => {
    return await Chat.find({ event: eventId });
  },
};

const Mutation = {
  createChat: async (_: any, { input }: any, { user }: any) => {
    requireAuth(user);
    if (!canCreateResource(user, "Chat")) throw new Error("Insufficient permissions");
    const chat = await Chat.create({ ...input, sender: user.id });
    return chat;
  },
};

const Subscription = {
  // To be implemented later (requires PubSub or Redis)
};

export default { Query, Mutation, Subscription };
