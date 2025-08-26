import express from "express";
import { authLimiter } from "../middlewares/rateLimite";
import { authorizeRoles, isAuthenticatedUser } from "../middlewares/auth";
import { getAllNotifications, getNotifications, updateNotification } from "../controllers/notification.controller";
const notificationRouter = express.Router();

notificationRouter.get(
    "/get-all-notifications",
    authLimiter,
    isAuthenticatedUser,
    authorizeRoles("admin"),
    getAllNotifications
);
notificationRouter.get(
    "/get-notifications-for-authors",
    authLimiter,
    isAuthenticatedUser,
    getNotifications
);
//TODO: test update notification 
notificationRouter.put(
    "/update-notification/:id",
    authLimiter,
    isAuthenticatedUser,
    authorizeRoles("admin"),
    updateNotification
);




export default notificationRouter