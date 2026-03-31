import { User } from "../../models/User";
import { Event } from "../../models/Event";
import { generateToken } from "../../utils/auth";

export const Query = {
  me: async (_: any, __: any, { user }: any) => {
    console.log("Authenticated user:", user);

    // Guard against missing user or userId
    if (!user?.userId) {
      console.log("❌ No decoded userId. Token invalid/missing.");
      return null;
    }

    try {
      console.log("Looking for user:", user.userId);

      const foundUser = await User.findById(user.userId)
        .populate("organizations")
        .populate("events");

      if (!foundUser) {
        console.error(`❌ User ${user.userId} not found`);
        return null;
      }

      // Safely normalize IDs with null/undefined handling
      const userObject = foundUser?.toObject?.() ?? {};

      return {
        ...userObject,
        id: foundUser._id?.toString?.() ?? null,
        organizations: (foundUser.organizations ?? [])
          .filter((org) => org != null) // Remove null/undefined orgs
          .map((org: any) => ({
            ...(org?.toObject?.() ?? {}),
            id: org?._id?.toString?.() ?? null,
          })),
        events: (foundUser.events ?? [])
          .filter((event) => event != null) // Remove null/undefined events
          .map((event: any) => ({
            ...(event?.toObject?.() ?? {}),
            id: event?._id?.toString?.() ?? null,
          })),
      };
    } catch (err) {
      console.error("❌ Error fetching ME:", err);
      return null;
    }
  },

  users: async () => {
    const users = await User.find()
      .populate("organizations")
      .populate("events");

    return users.map((user: any) => ({
      ...user.toObject(),
      id: user._id.toString(),
      organizations: user.organizations.map((org: any) => ({
        ...org.toObject(),
        id: org._id.toString(),
      })),
      events: user.events.map((event: any) => ({
        ...event.toObject(),
        id: event._id.toString(),
      })),
    }));
  },

  user: async (_: any, { id }: any) => {
    // Guard against missing id
    if (!id) return null;

    const foundUser = await User.findById(id)
      .populate("organizations")
      .populate("events");

    if (!foundUser) return null;

    // Safely convert to object, with fallback
    const userObject = foundUser?.toObject?.() ?? {};

    // Safely map organizations, handle null/undefined
    const organizations = (foundUser.organizations ?? [])
      .filter((org) => org != null) // Remove null/undefined orgs
      .map((org: any) => ({
        ...(org?.toObject?.() ?? {}),
        id: org?._id?.toString?.() ?? null,
      }));

    // Safely map events, handle null/undefined
    const events = (foundUser.events ?? [])
      .filter((event) => event != null) // Remove null/undefined events
      .map((event: any) => ({
        ...(event?.toObject?.() ?? {}),
        id: event?._id?.toString?.() ?? null,
      }));

    return {
      ...userObject,
      id: foundUser._id?.toString?.() ?? null,
      organizations,
      events,
    };
  },
};

const Mutation = {
  register: async (_: any, { input }: { input: any }) => {
    const { name, email, phone, role, organizationId } = input;

    // Check for existing email
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      throw new Error("Email already exists.");
    }

    // Check for existing phone
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      throw new Error("Phone already exists.");
    }

    // Create user (phone is stored as plain text per your schema)
    const user = await User.create({
      name,
      email,
      phone,
      role: role || "PARTICIPANT",
      organizations: [],
    });

    const token = generateToken(user);

    return { token, user };
  },
  verifyEventKey: async (
    _: any,
    { eventKey, userId }: { eventKey: string; userId: string },
  ) => {
    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Find the event where this user is a participant AND has matching eventKey
    const event = await Event.findOne({
      eventKey: eventKey,
      participants: user._id,
    });

    if (!event) {
      throw new Error(
        "Invalid event key or you're not registered for this event",
      );
    }

    // You can generate a new token with additional claims or just return success
    return {
      success: true,
      message: "Event key verified successfully",
      event,
    };
  },

  participantLogin: async (
    _: any,
    { eventSecret, phone }: { eventSecret: string; phone: string },
  ) => {
    // Add input validation
    if (!phone || !eventSecret) {
      throw new Error("Phone and event secret are required");
    }

    // 1. Find the user by phone
    const user = await User.findOne({ phone });
    if (!user) {
      console.log(`❌ User not found for phone: ${phone}`);
      throw new Error("Invalid credentials or event key");
    }

    // 2. Find the event by eventSecret
    const event = await Event.findOne({ eventSecret }).populate([
      "organizer",
      "organization",
      {
        path: "facilitators",
        select: "_id name email",
      },
      {
        path: "participants",
        select: "_id name email phone",
      },
    ]);

    if (!event) {
      console.log(`❌ Event not found for eventSecret: ${eventSecret}`);
      throw new Error("Invalid credentials or event key");
    }

    // Log event details for debugging
    console.log(`✅ Event found: ${event.title} (${event._id})`);
    console.log(
      `Event secret: ${event.eventSecret}, Event key: ${event.eventKey}`,
    );
    console.log(
      `Event capacity: ${event.capacity}, Current participants: ${event.participants.length}`,
    );

    // 3. Check if event has ended
    const now = new Date();
    if (event.dateTime.end && new Date(event.dateTime.end) < now) {
      console.log(`❌ Event has ended: ${event.dateTime.end} < ${now}`);
      throw new Error("This event has already ended");
    }

    // 4. Check capacity
    const maxCapacity = event.capacity ?? 100;
    if (event.participants.length >= maxCapacity) {
      console.log(
        `❌ Event at capacity: ${event.participants.length}/${maxCapacity}`,
      );
      throw new Error("Event has reached maximum capacity");
    }

    // 5. Check if user is already a participant
    const isParticipant = event.participants.some((participant: any) => {
      const participantId =
        participant._id?.toString() || participant.toString();
      return participantId === user._id.toString();
    });

    if (!isParticipant) {
      console.log(`➕ Adding user ${user._id} to event participants`);
      event.participants.push(user._id);
      await event.save();
      console.log(
        `✅ User added successfully. New participant count: ${event.participants.length}`,
      );
    } else {
      console.log(`ℹ️ User ${user._id} is already a participant`);
    }

    // 6. Generate JWT token for participant
    const token = generateToken(user);

    // Return the event with eventKey for the 2-step verification
    console.log({
      message: "Participant login successful - awaiting event key verification",
      userId: user._id,
      eventId: event._id,
      eventSecret: event.eventSecret,
      eventKey: event.eventKey,
      tokenGenerated: !!token,
      date: new Date().toISOString(),
    });

    // 7. Return token, user, and event (event contains eventKey for 2-step verification)
    return {
      token,
      user,
      event, // Client will need to use event.eventKey for the next verification step
    };
  },

  login: async (_: any, { phone, eventSecret }: any) => {
    // 1. Find User by phone
    const user = await User.findOne({ phone });
    if (!user) {
      // NOTE: For security, don't reveal if user or event failed.
      throw new Error("Invalid credentials or event key");
    }

    // 2. Find Event by eventSecret
    const event = await Event.findOne({ eventSecret });
    if (!event) {
      throw new Error("Invalid credentials or event key");
    }

    // 3. Check if event has ended (optional - add if needed)
    const now = new Date();
    if (event.dateTime.end && new Date(event.dateTime.end) < now) {
      throw new Error("This event has already ended");
    }

    // 4. Check capacity
    const maxCapacity = event.capacity ?? 100;
    if (event.participants.length >= maxCapacity) {
      throw new Error("Event has reached maximum capacity");
    }

    // 5. Check if user is already a participant
    const isParticipant = event.participants.some(
      (participantId: any) => participantId.toString() === user._id.toString(),
    );

    if (!isParticipant) {
      // FIXED: Direct array manipulation instead of addParticipant
      event.participants.push(user._id);
      await event.save();
    }

    // 6. Generate and return auth token
    const token = generateToken(user);
    return { token, user };
  },
};

export default { Query, Mutation };
