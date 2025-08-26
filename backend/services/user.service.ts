import { NextFunction, Response } from "express"

import { redis } from "../utils/redis"
import userModel from "../models/user.model"


// get user By id 
export const getUserById = async (id: string, res: Response, next: NextFunction) => {
    const userJson = await redis.get(id)
    if (userJson) {
        const user = JSON.parse(userJson)
        res.status(201).json({
            success: true,
            user,
        })

    }

}

// get all users service 
export const getAllUsersService = async (res: Response) => {
    const users = await userModel.find().sort({ createdAt: -1 }).lean()

    res.status(200).json({
        success: true,
        users
    })
}
// update user role service 


/**
 * Update user role service.
 *
 * @param {Response} res - the response object
 * @param {string} userId - the user ID
 * @param {string} role - the new role
 * @return {Promise<void>} a promise representing the completion of the update
 */
export const updateUserRoleService = async (
    res: Response,
    userId: string,
    role: string
) => {

    const updatedUser = await userModel.findOneAndUpdate(
        { _id: userId },
        { role },
        { new: true }
    );

    if (!updatedUser) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        });
    }

    // Use Redis set command directly instead of promisify
    redis.set(userId, JSON.stringify(updatedUser));

    res.status(200).json({
        success: true,
        message: `${updatedUser.username} role updated successfully to ${role}`,
        updatedUser,
    });

};
// delete userService admin and user its self can delete his recorde but withe just user.isDeleted
export const deleteUserService = async (res: Response, userId: string) => {

    const deletedUser = await userModel.findOneAndUpdate(
        { _id: userId },
        { isDeleted: true },
        { new: true }
    );
    if (!deletedUser) {
        return res.status(404).json({
            success: false,
            message: `operation failed to delete user with id ${userId}`,
        });
    }
    // Use Redis set command directly instead of promisify
    redis.del(userId);
    res.status(200).json({
        success: true,
        message: `user: ${deletedUser.username} deleted successfully`,
        deletedUser,
    });
}
// undelete user 
export const unDeleteUserService = async (res: Response, userId: string) => {

    const deletedUser = await userModel.findOneAndUpdate(
        { _id: userId },
        { isDeleted: false },
        { new: true }
    );
    if (!deletedUser) {
        return res.status(404).json({
            success: false,
            message: `operation failed to restore user with id ${userId}`,
        });
    }
    // Use Redis set command directly instead of promisify
    redis.set(userId, JSON.stringify(deletedUser));
    res.status(200).json({
        success: true,
        message: `user: ${deletedUser.username} restored data successfully`,
        deletedUser,
    });
}
// banned user service 
export const bannedUserService = async (res: Response, userId: string) => {
    const bannedUser = await userModel.findOneAndUpdate(
        { _id: userId },
        { isBanned: true },
        { new: true }
    );
    if (!bannedUser) {
        return res.status(404).json({
            success: false,
            message: `operation failed to ban user with id ${userId}`,
        });
    }
    // Use Redis set command directly instead of promisify
    redis.del(userId, JSON.stringify(bannedUser));
    res.status(200).json({
        success: true,
        message: `user: ${bannedUser.username} banned successfully`,
        bannedUser,
    });
}
// unbanned user service
export const unBannedUserService = async (res: Response, userId: string) => {
    const unBannedUser = await userModel.findOneAndUpdate(
        { _id: userId },
        { isBanned: false },
        { new: true }
    );
    if (!unBannedUser) {
        return res.status(404).json({
            success: false,
            message: `operation failed to restore user with id ${userId}`,
        });
    }
    // Use Redis set command directly instead of promisify
    redis.set(userId, JSON.stringify(unBannedUser));
    res.status(200).json({
        success: true,
        message: `user: ${unBannedUser.username} unbanned successfully`,
        unBannedUser,
    });
}