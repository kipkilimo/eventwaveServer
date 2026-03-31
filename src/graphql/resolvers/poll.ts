import { Poll } from "../../models/Poll";
import { requireAuth, canCreateResource } from "../../utils/auth";

const Query = {
  eventPolls: async (_: any, { eventId }: any) => {
    return await Poll.find({ event: eventId });
  },
};

const Mutation = {
  createPoll: async (_: any, { input }: any, { user }: any) => {
    requireAuth(user);
    if (!canCreateResource(user, "Poll")) throw new Error("Insufficient permissions");
    const poll = await Poll.create({ ...input, createdBy: user.id });
    return poll;
  },

  votePoll: async (_: any, { pollId, optionIndex }: any, { user }: any) => {
    requireAuth(user);
    const poll = await Poll.findById(pollId);
    if (!poll) throw new Error("Poll not found");

    const option = poll.options[optionIndex];
    if (!option) throw new Error("Invalid option");

    // Prevent duplicate vote
    const existing = poll.options.some((o: any) => o.votes.includes(user.id));
    if (existing) {
      poll.options.forEach((o: any) => {
        o.votes = o.votes.filter((v: any) => v.toString() !== user.id.toString());
      });
    }

    option.votes.push(user.id);
    await poll.save();
    return poll;
  },
};

export default { Query, Mutation };
