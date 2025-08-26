import { Request, Response, NextFunction } from "express";
import NotificationModel from "../models/notification.model";
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import cron from "node-cron";
// Define a function called getAllNotifications which is wrapped with catchAsyncErrors middleware
export const getAllNotifications = catchAsyncErrors(
    // Define an asynchronous arrow function that takes req, res, and next as parameters
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Retrieve all notifications from the database, convert them to plain JavaScript objects, and sort them by createdAt timestamp in descending order
            const notifications = await NotificationModel.find().lean().sort({ createdAt: -1 });
            // Send a 200 status response with a JSON object containing success status and the retrieved notifications
            if (!notifications.length) {
                return next(new ErrorHandler(`No notifications found for the ${req.user?.role}: ${req.user?.username} `, 404));
            }
            res.status(200).json({
                success: true,
                notifications
            })

        } catch (error: any) {
            // If an error occurs, call the next middleware with a new instance of the ErrorHandler class, passing the error message and HTTP status code 500
            return next(new ErrorHandler(error.message, 500))
        }
    }
)


// Retrieves all notifications specifically for authors, filtering out notifications intended for other roles
export const getNotifications = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = req.user;
            if (!user) {
                return next(new ErrorHandler(`User not found`, 404));
            }


            const notifications = await NotificationModel.find({ user: user._id }).lean().sort({ createdAt: -1 });
            if (!notifications.length) {
                return next(new ErrorHandler(`No notifications found for the ${user.role}: ${user.username} `, 404));

            }
            res.status(200).json({
                success: true,
                notifications
            })

        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500))
        }
    }
)
//update notification status for admin 
export const updateNotification = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = req.params.id;
            const user = req.user;
            if (!id || !user) {
                return next(new ErrorHandler(`Notification or user not found`, 404));
            }
            const updatedNotification = await NotificationModel.findByIdAndUpdate(
                id,
                { status: "read" },
                { new: true }
            ).lean();
            if (!updatedNotification) {
                return next(new ErrorHandler(`Notification not found`, 404));
            }
            const notifications = await NotificationModel.find().sort({ createdAt: -1 }).lean();
            res.status(200).json({
                success: true,
                message: "Notification status updated",
                notification: notifications
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    }
);

// update notification status for author and user 
export const updateNotificationForAuthor = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = req.params.id;
            const user = req.user;
            if (!id || !user) {
                return next(new ErrorHandler(`Notification or user not found`, 404));
            }
            const updatedNotification = await NotificationModel.findByIdAndUpdate(
                id,
                { status: "read" },
                { new: true }
            ).lean();
            if (!updatedNotification) {
                return next(new ErrorHandler(`Notification not found`, 404));
            }
            // find all notifications for the user 
            const notifications = await NotificationModel.find({ user: user._id }).sort({ createdAt: -1 }).lean();
            res.status(200).json({
                success: true,
                message: "Notification status updated",
                notification: notifications
            })
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 500));
        }
    }
)

// cron to delete notifications older than 30 days at 00:00
const deleteOldNotifications = async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await NotificationModel.deleteMany({
        status: "read",
        createdAt: { $lt: thirtyDaysAgo }
    });
};

cron.schedule("00 00 * * *", async () => {
    console.log("Deleting old notifications...");
    await deleteOldNotifications();
    console.log("Old notifications deleted.");
});