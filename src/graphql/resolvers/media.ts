// src/graphql/resolvers/mediaResolvers.ts
import { IResolvers } from "@graphql-tools/utils";
import { Media } from "../../models/Media";
import { Event } from "../../models/Event";
import { User } from "../../models/User";
import { AuthenticationError, UserInputError } from "apollo-server-errors";
// import { requireAuth } from "../../utils/auth"; // Optional auth enforcement

// ===============================
// 🧩 FIELD RESOLVERS
// ===============================
const MediaFields = {
  event: async (parent: any) => await Event.findById(parent.event),
  uploader: async (parent: any) => await User.findById(parent.uploader),
};

// ===============================
// 🧠 QUERY RESOLVERS
// ===============================
const Query = {
  // 1️⃣ Fetch a single media item by ID
  getMediaById: async (_: any, { id }: { id: string }) => {
    const media = await Media.findById(id)
      .populate("event")
      .populate("uploader");
    if (!media) throw new UserInputError("Media not found");
    return media;
  },

  // 2️⃣ Fetch all media files for a specific event
  getEventMedia: async (_: any, { eventId }: { eventId: string }) => {
    const mediaList = await Media.find({ event: eventId })
      .populate("event")
      .populate("uploader")
      .sort({ uploadedAt: -1 });

    return mediaList;
  },

  // 3️⃣ Fetch all media uploaded by a specific user
  getUserMedia: async (_: any, { userId }: { userId: string }) => {
    const mediaList = await Media.find({ uploader: userId })
      .populate("event")
      .populate("uploader")
      .sort({ uploadedAt: -1 });

    return mediaList;
  },
};

// ===============================
// ⚙️ MUTATION RESOLVERS
// ===============================
const Mutation = {
  // 1️⃣ Create a new media record (after S3 upload)
  createMedia: async (
    _: any,
    {
      input,
    }: {
      input: {
        event: string;
        uploader: string;
        title?: string;
        description?: string;
        type: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        mediaUrl: string;
      };
    },
    { user }: any
  ) => {
    // Optional: enforce auth
    // requireAuth(user);

    const { event, uploader, ...rest } = input;

    const eventExists = await Event.findById(event);
    if (!eventExists) throw new UserInputError("Event not found");

    const userExists = await User.findById(uploader);
    if (!userExists) throw new UserInputError("Uploader not found");

    const media = new Media({
      event,
      uploader,
      ...rest,
    });

    await media.save();
    return await media.populate(["event", "uploader"]);
  },

  // 2️⃣ Delete a media record by ID
  deleteMedia: async (_: any, { id }: { id: string }, { user }: any) => {
    // Optional: enforce auth
    // requireAuth(user);

    const media = await Media.findById(id);
    if (!media) throw new UserInputError("Media not found");

    await media.deleteOne();
    return true;
  },
};

// ===============================
// 📦 EXPORT
// ===============================
export const mediaResolvers: IResolvers = {
  Media: MediaFields,
  Query,
  Mutation,
};
