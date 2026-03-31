// src/graphql/resolvers/event/queries.ts
import { Types } from "mongoose";
import { Event } from "../../../models/Event";
import { normalizeEvent } from "./utils";

export const Query = {
  events: async (_: any, { filters, limit, offset }: any) => {
    const filter: any = {};

    if (filters?.status) filter.status = filters.status;
    if (filters?.eventType) filter.eventType = filters.eventType;
    if (
      filters?.organizationId &&
      Types.ObjectId.isValid(filters.organizationId)
    )
      filter.organization = filters.organizationId;
    if (filters?.organizerId && Types.ObjectId.isValid(filters.organizerId))
      filter.organizer = filters.organizerId;
    if (filters?.isFreeEvent !== undefined)
      filter.isFreeEvent = filters.isFreeEvent;
    if (filters?.isShortEvent !== undefined)
      filter.isShortEvent = filters.isShortEvent;
    if (filters?.fromDate)
      filter["dateTime.start"] = { $gte: new Date(filters.fromDate) };
    if (filters?.toDate)
      filter["dateTime.end"] = { $lte: new Date(filters.toDate) };
    if (filters?.search) {
      filter.$or = [
        { title: { $regex: filters.search, $options: "i" } },
        { description: { $regex: filters.search, $options: "i" } },
      ];
    }

    let query = Event.find(filter).sort({ "dateTime.start": 1 });

    if (limit) query = query.limit(limit);
    if (offset) query = query.skip(offset);

    const events = await query
      .populate("organizer")
      .populate("organization")
      .populate("participants")
      .populate("facilitators")
      .populate("admins")
      .lean();

    return events.map(normalizeEvent);
  },

  eventsPaginated: async (_: any, { filters, first = 10, after }: any) => {
    const filter: any = {};

    if (filters?.status) filter.status = filters.status;
    if (filters?.eventType) filter.eventType = filters.eventType;
    if (
      filters?.organizationId &&
      Types.ObjectId.isValid(filters.organizationId)
    )
      filter.organization = filters.organizationId;
    if (filters?.organizerId && Types.ObjectId.isValid(filters.organizerId))
      filter.organizer = filters.organizerId;
    if (filters?.isFreeEvent !== undefined)
      filter.isFreeEvent = filters.isFreeEvent;
    if (filters?.isShortEvent !== undefined)
      filter.isShortEvent = filters.isShortEvent;
    if (filters?.fromDate)
      filter["dateTime.start"] = { $gte: new Date(filters.fromDate) };
    if (filters?.toDate)
      filter["dateTime.end"] = { $lte: new Date(filters.toDate) };
    if (filters?.search) {
      filter.$or = [
        { title: { $regex: filters.search, $options: "i" } },
        { description: { $regex: filters.search, $options: "i" } },
      ];
    }

    let cursorFilter: any = { ...filter };
    if (after) {
      const decodedCursor = Buffer.from(after, "base64").toString();
      const cursorDoc = await Event.findById(decodedCursor);
      if (cursorDoc) {
        cursorFilter = {
          ...filter,
          $or: [
            { "dateTime.start": { $gt: cursorDoc.dateTime.start } },
            {
              "dateTime.start": cursorDoc.dateTime.start,
              _id: { $gt: cursorDoc._id },
            },
          ],
        };
      }
    }

    const events = await Event.find(cursorFilter)
      .sort({ "dateTime.start": 1, _id: 1 })
      .limit(first)
      .populate("organizer")
      .populate("organization")
      .populate("participants")
      .populate("facilitators")
      .populate("admins")
      .lean();

    const totalCount = await Event.countDocuments(filter);

    const edges = events.map((event) => ({
      node: normalizeEvent(event),
      cursor: Buffer.from(event._id.toString()).toString("base64"),
    }));

    const hasNextPage = events.length === first;
    const hasPreviousPage = !!after;

    return {
      edges,
      pageInfo: {
        hasNextPage,
        hasPreviousPage,
        startCursor: edges[0]?.cursor,
        endCursor: edges[edges.length - 1]?.cursor,
      },
      totalCount,
    };
  },

  event: async (_: any, { id }: any) => {
    if (!Types.ObjectId.isValid(id)) throw new Error("Invalid event ID");
    const event = await Event.findById(id)
      .populate("organizer")
      .populate("organization")
      .populate("participants")
      .populate("facilitators")
      .populate("admins")
      .lean();
    if (!event) throw new Error("Event not found");
    return normalizeEvent(event);
  },

  async eventBySecret(_: any, { eventSecret }: { eventSecret: string }) {
    if (!eventSecret?.trim()) throw new Error("Event key is required");
    const event = await Event.findOne({ eventSecret })
      .populate("organizer")
      .populate("organization")
      .populate("participants")
      .populate("facilitators")
      .populate("admins")
      .lean();
    if (!event) throw new Error("Event not found");
    return normalizeEvent(event);
  },

  userEvents: async (_: any, { userId, status }: any) => {
    if (!Types.ObjectId.isValid(userId)) throw new Error("Invalid user ID");

    const filter: any = {
      $or: [{ organizer: userId }, { participants: userId }],
    };
    if (status) filter.status = status;

    const events = await Event.find(filter)
      .select({
        _id: 1,
        title: 1,
        description: 1,
        eventSecret: 1,
        eventType: 1,
        status: 1,
        "dateTime.start": 1,
        "dateTime.end": 1,
        "location.name": 1,
        "location.address": 1,
        "location.isVirtual": 1,
        capacity: 1,
        isFreeEvent: 1,
        tags: 1,
        organizer: 1,
      })
      .populate("organizer", "_id name")
      .sort({ "dateTime.start": 1 })
      .lean();

    return events.map(normalizeEvent);
  },

  async userFacilitatingEvents(_: any, { userId }: { userId: string }) {
    if (!Types.ObjectId.isValid(userId))
      throw new Error("Invalid organizer ID");
    const events = await Event.find({
      $or: [{ organizer: userId }, { facilitators: userId }],
    })
      .select({
        _id: 1,
        title: 1,
        eventSecret: 1,
        status: 1,
        eventType: 1,
        "dateTime.start": 1,
        "dateTime.end": 1,
        "location.name": 1,
        "location.isVirtual": 1,
        capacity: 1,
        participants: 1,
        organizer: 1,
        facilitators: 1,
      })
      .populate({ path: "organizer", select: "_id name" })
      .populate({ path: "facilitators", select: "_id name" })
      .sort({ "dateTime.start": 1 })
      .lean();
    return events.map(normalizeEvent);
  },

  async organizationEvents(_: any, { organizationId }: any) {
    if (!Types.ObjectId.isValid(organizationId))
      throw new Error("Invalid organization ID");
    const events = await Event.find({ organization: organizationId })
      .select({
        _id: 1,
        title: 1,
        eventSecret: 1,
        status: 1,
        eventType: 1,
        "dateTime.start": 1,
        "dateTime.end": 1,
        "location.name": 1,
        "location.isVirtual": 1,
        capacity: 1,
        participants: 1,
        organizer: 1,
        facilitators: 1,
      })
      .populate({ path: "organizer", select: "_id name" })
      .populate({ path: "facilitators", select: "_id name" })
      .sort({ "dateTime.start": 1 })
      .lean();
    return events.map(normalizeEvent);
  },
};
