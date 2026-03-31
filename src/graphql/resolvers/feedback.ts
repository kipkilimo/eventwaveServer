import { FeedbackService } from "../../services/feedback.service";

export const feedbackResolvers = {
  Query: {
    getFeedbackById: (_: any, { id }: { id: string }) =>
      FeedbackService.getById(id),

    getFeedbackByAccessKey: (_: any, { accessKey }: { accessKey: string }) =>
      FeedbackService.getByAccessKey(accessKey),

    getAllFeedbacks: (_: any, { filter, limit, offset }: any) =>
      FeedbackService.getAll(filter, limit, offset),

    getFeedbackForTarget: (_: any, { targetId, targetType }: any) =>
      FeedbackService.getForTarget(targetId, targetType),

    getFeedbackAnalytics: (_: any, { feedbackId }: { feedbackId: string }) =>
      FeedbackService.getAnalytics(feedbackId),
    getAllEventFeedbacks: async (
      _: any,
      { eventId }: { eventId: string },
      ctx: any
    ) => {
      if (!eventId) {
        throw new Error("Event ID is required");
      }

      // Optional auth guard
      // if (!ctx.user) throw new AuthenticationError("Unauthorized");

      return FeedbackService.getAllEventFeedbacks(eventId);
    },

    getMyFeedbackSubmissions: (_: any, { userId }: { userId: string }) =>
      // @ts-ignore
      FeedbackService.getAll({ "responses.participantId": userId }),

    getCreatedFeedbacks: (_: any, { userId }: { userId: string }) =>
      FeedbackService.getCreatedBy(userId),

    exportFeedbackResponses: (_: any, { feedbackId, format }: any) =>
      FeedbackService.exportResponses(feedbackId, format),
  },

  Mutation: {
    createFeedback: (_: any, args: any, ctx: { user: { id: string } }) =>
      FeedbackService.createFeedback(args, ctx.user.id),

    updateFeedback: (_: any, { id, input }: { id: string; input: any }) =>
      FeedbackService.updateFeedback(id, input),

    deleteFeedback: (_: any, { id }: { id: string }) =>
      FeedbackService.deleteFeedback(id),

    closeFeedback: (_: any, { id }: { id: string }) =>
      FeedbackService.closeFeedback(id),

    reopenFeedback: (_: any, { id }: { id: string }) =>
      FeedbackService.reopenFeedback(id),

    submitFeedback: (_: any, { input }: { input: any }) =>
      FeedbackService.submitFeedback(input),

    deleteFeedbackResponse: (
      _: any,
      { feedbackId, responseId }: { feedbackId: string; responseId: string }
    ) => FeedbackService.deleteFeedbackResponse(feedbackId, responseId),

    addFeedbackParticipants: (
      _: any,
      {
        feedbackId,
        participantIds,
      }: { feedbackId: string; participantIds: any[] }
    ) => FeedbackService.addParticipants(feedbackId, participantIds),

    removeFeedbackParticipants: (
      _: any,
      {
        feedbackId,
        participantIds,
      }: { feedbackId: string; participantIds: string[] }
    ) => FeedbackService.removeParticipants(feedbackId, participantIds),

    sendFeedbackReminder: async () => true,

    generateFeedbackAccessKeys: async () => [],
  },
};
