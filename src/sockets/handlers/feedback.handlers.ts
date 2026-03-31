import { Server, Socket } from "socket.io";
import { FeedbackService } from "../../services/feedback.service";

export const FEEDBACK_EVENTS = {
  SUBMITTED: "feedbackSubmitted",
  ANALYTICS_UPDATED: "feedbackAnalyticsUpdated",
  STATUS_CHANGED: "feedbackStatusChanged",
  PARTICIPANTS_UPDATED: "feedbackParticipantsUpdated",
  REMINDER_SENT: "feedbackReminderSent",
  ACCESS_KEYS_UPDATED: "feedbackAccessKeysUpdated",
  RESPONSE_WINDOW_UPDATED: "feedbackResponseWindowUpdated",
};

const feedbackRoom = (feedbackId: string) => `feedback:${feedbackId}`;

export const feedbackSocketHandler = (io: Server, socket: Socket) => {
  /* -----------------------------
   * Join / Leave feedback room
   * ----------------------------- */
  socket.on("joinFeedback", (feedbackId: string) => {
    socket.join(feedbackRoom(feedbackId));
  });

  socket.on("leaveFeedback", (feedbackId: string) => {
    socket.leave(feedbackRoom(feedbackId));
  });

  /* -----------------------------
   * Feedback Submission
   * ----------------------------- */
  socket.on(FEEDBACK_EVENTS.SUBMITTED, async ({ feedbackId }: { feedbackId: string }) => {
    const feedback = await FeedbackService.getById(feedbackId);
    if (!feedback) return;

    const latestResponse = feedback.responses[feedback.responses.length - 1];

    io.to(feedbackRoom(feedbackId)).emit(FEEDBACK_EVENTS.SUBMITTED, latestResponse);

    const analytics = await FeedbackService.getAnalytics(feedbackId);
    io.to(feedbackRoom(feedbackId)).emit(FEEDBACK_EVENTS.ANALYTICS_UPDATED, analytics);
  });

  /* -----------------------------
   * Status Changed (Closed / Reopened)
   * ----------------------------- */
  socket.on(FEEDBACK_EVENTS.STATUS_CHANGED, async ({ feedbackId }: { feedbackId: string }) => {
    const feedback = await FeedbackService.getById(feedbackId);
    if (!feedback) return;

    io.to(feedbackRoom(feedbackId)).emit(FEEDBACK_EVENTS.STATUS_CHANGED, feedback);
  });

  /* -----------------------------
   * Participants Updated
   * ----------------------------- */
  socket.on(FEEDBACK_EVENTS.PARTICIPANTS_UPDATED, async ({ feedbackId }: { feedbackId: string }) => {
    const feedback = await FeedbackService.getById(feedbackId);
    if (!feedback) return;

    io.to(feedbackRoom(feedbackId)).emit(FEEDBACK_EVENTS.PARTICIPANTS_UPDATED, feedback.participants);
  });

  /* -----------------------------
   * Reminder Sent
   * ----------------------------- */
  socket.on(FEEDBACK_EVENTS.REMINDER_SENT, async ({ feedbackId }: { feedbackId: string }) => {
    io.to(feedbackRoom(feedbackId)).emit(FEEDBACK_EVENTS.REMINDER_SENT, { feedbackId, sentAt: new Date() });
  });

  /* -----------------------------
   * Access Keys Updated
   * ----------------------------- */
  socket.on(FEEDBACK_EVENTS.ACCESS_KEYS_UPDATED, async ({ feedbackId, keys }: { feedbackId: string; keys: string[] }) => {
    io.to(feedbackRoom(feedbackId)).emit(FEEDBACK_EVENTS.ACCESS_KEYS_UPDATED, { feedbackId, keys });
  });

  /* -----------------------------
   * Response Acceptance / Window Updated
   * ----------------------------- */
  socket.on(FEEDBACK_EVENTS.RESPONSE_WINDOW_UPDATED, async ({ feedbackId }: { feedbackId: string }) => {
    const feedback = await FeedbackService.getById(feedbackId);
    if (!feedback) return;

    io.to(feedbackRoom(feedbackId)).emit(FEEDBACK_EVENTS.RESPONSE_WINDOW_UPDATED, {
      feedbackId,
      isAcceptingResponses: feedback.isAcceptingResponses,
      lastAcceptedResponsesDate: feedback.lastAcceptedResponsesDate,
      responseWindowDuration: feedback.responseWindowDuration,
    });
  });
};
