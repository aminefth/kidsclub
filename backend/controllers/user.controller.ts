
/* The above code is implementing user registration, activation, and login functionality in a
TypeScript Node.js application. */


require("dotenv").config();
import { Request, Response, NextFunction } from "express";
import userModel, { IUser } from "../models/user.model";
import ErrorHandler from "../utils/ErrorHandler";
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors";
import jwt, { JwtPayload, Secret } from "jsonwebtoken";
import ejs from "ejs";
import path from "path";
import sendMail from "../utils/sendMail";
import { accessTokenOptions, refreshTokenOptions, sendToken } from "../utils/jwt";
import { redis } from "../utils/redis";
import { deleteUserService, getAllUsersService, getUserById, updateUserRoleService } from "../services/user.service";
import imageKit from "../utils/imagekit";
import BlogModel from '../models/blogs.model';
import { ObjectId } from "mongoose";


let passwordRegex: RegExp = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
let emailRegex: RegExp = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

// generateUsername function is used to generate a unique username for a user

const generateUsername = async (email: string) => {
    let username = email.split('@')[0];

    let isUsernameNotUnique = await userModel.exists({ username }).then((result) => result);

    if (isUsernameNotUnique) {

        username = username + Math.floor(Math.random() * 1000)
    }

    return username;
}

/* The code is implementing the registration functionality for a user. */
// register user 

interface IRegistrationBody {
    name: string;
    email: string;
    password: string;
}
/**
 * @swagger
 * /api/v1/registration:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: Must contain at least one uppercase, lowercase, number and special character
 *     responses:
 *       201:
 *         description: User registered successfully, activation email sent
 *       400:
 *         description: Invalid input or user already exists
 */
export const registrationUser = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {

    try {
        const { name, email, password }: IRegistrationBody = req.body;
        const isEmailExist = await userModel.findOne({ email });
        if (isEmailExist) {
            return next(new ErrorHandler("Email already exist", 400));
        }
        if (!name.length || !email.length || !password.length) {
            return next(new ErrorHandler("Please enter all fields", 400));
        }

        if (emailRegex.test(email) === false) {
            return next(new ErrorHandler("Please enter a valid email", 400));
        }
        if (passwordRegex.test(password) === false) {
            return next(new ErrorHandler("Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number and one special character", 400))
        }

        if (name.length < 3) {
            return next(new ErrorHandler("Name must be at least 3 characters", 400));
        }

        const user: IRegistrationBody = {
            name,
            email,
            password,
        };

        const activationToken = createActivationToken(user);

        const activationCode = activationToken.activationCode;
        const data = { user: { name: user.name, email: user.email }, activationCode };
        const html = await ejs.renderFile(
            path.join(__dirname, "../mails/activation-mail.ejs"),
            data
        );
        try {
            await sendMail({
                email: user.email,
                subject: "Activate your account in Pareto Hub",
                template: "activation-mail.ejs",
                data,
            });

            res.status(201).json({
                success: true,
                message: `Please check your email: ${user.email} to activate your account in Pareto Hub you have to enter the activation code in 5 next minutes`,
                activationToken: activationToken.token,
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }



    } catch (error: any) {
        return next(new ErrorHandler(error.message, 400));
    }

}

)
// create activation token

interface IActivationToken {
    token: string;
    activationCode: string;
}

export const createActivationToken = (user: any): IActivationToken => {
    const activationCode = Math.floor(1000 + Math.random() * 9000).toString();

    const token = jwt.sign({ user, activationCode }, process.env.ACTIVATION_SECRET as Secret, {
        expiresIn: "5m",
    });
    return { token, activationCode };

}

// activate user 

interface IActivationRequest {
    activation_token: string;
    activation_code: string;
}

export const activateUser = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { activation_token, activation_code }: IActivationRequest =
                req.body;

            const newUser: { user: IUser; activationCode: string } = jwt.verify(
                activation_token,
                process.env.ACTIVATION_SECRET as string
            ) as { user: IUser; activationCode: string };

            if (newUser.activationCode !== activation_code) {
                return next(new ErrorHandler("Invalid activation code", 400));
            }


            const { name, email, password } = newUser.user

            const isUserExist = await userModel.findOne({ email });

            if (isUserExist) {
                return next(new ErrorHandler("User already exist", 400));
            }
            let username = await generateUsername(email);
            const user = await userModel.create({
                name,
                email,
                password,
                username,
            });

            res.status(201).json({
                success: true,
                message: "User registered successfully",
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
);


// login user with username and password or email and Password

interface ILoginRequest {
    username: string;
    password: string;
    email: string;
}

export const loginUser = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { username, password, email }: ILoginRequest = req.body;

        if (!username.length && !email.length) {
            return next(new ErrorHandler("Please enter username or email", 400));
        }
        if (!password.length) {
            return next(new ErrorHandler("Please enter password", 400));
        }

        const user = await userModel.findOne({ $or: [{ username }, { email }] }).select("+password");

        if (!user) {
            return next(new ErrorHandler("User not found ", 404));
        }

        const isPasswordMatched = await user.comparePassword(password);

        if (!isPasswordMatched) {
            return next(new ErrorHandler("Invalid password", 400));
        }

        // sendToken tor redis
        sendToken(user, 200, res)


    } catch (error: any) {
        return next(new ErrorHandler(error.message, 400));
    }


})

// logout user

export const logoutUser = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {
        res.cookie("access_token", "", { maxAge: 1 });
        res.cookie("refresh_token", "", { maxAge: 1 })
        const userId = req.user?._id as string;
        redis.del(userId)
        res.status(200).json({
            success: true,
            message: "Logged out successfully"
        })

    } catch (error: any) {
        return next(new ErrorHandler(error.message, 400))
    }
}
)

// update access token 
export const updateAccessToken = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const refresh_Token = req.cookies.refresh_token;
        const decodes = jwt.verify(refresh_Token, process.env.REFRESH_TOKEN as string) as JwtPayload
        const message = "Could not refresh token "

        if (!refresh_Token) {
            return next(new ErrorHandler(message, 400))
        }

        if (!decodes) {
            return next(new ErrorHandler(message, 400))

        }
        if (decodes.exp! < Date.now() / 1000) {
            return next(new ErrorHandler(message, 400))
        }
        // session redis
        const session = await redis.get(decodes.id as string)
        if (!session) {
            return next(new ErrorHandler(message, 400))
        }
        const user = JSON.parse(session as string)

        const accessToken = jwt.sign({ id: user._id }, process.env.ACCESS_TOKEN as string, {
            expiresIn: "5m",
        });

        const refreshToken = jwt.sign({ id: user._id }, process.env.REFRESH_TOKEN as string, {
            expiresIn: "7d",

        });
        res.cookie("access_token", accessToken, accessTokenOptions)
        res.cookie("refresh_token", refreshToken, refreshTokenOptions)

        req.user = user;
        res.status(200).json({
            success: "success",
            accessToken,
        })
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 400))
    }
})


// get user info
export const getUserInfo = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?._id as string;
            getUserById(userId, res, next)
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400))
        }

    })

// social auth
interface ISocialAuthBody {
    name: string;
    email: string;
    avatar: string;


}

export const socialAuth = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {

        let { name, email, avatar } = req.body as ISocialAuthBody;
        if (!emailRegex.test(email)) {
            return next(new ErrorHandler("Please retry again  Or entre valid email", 400));

        }

        const isUserExist = await userModel.findOne({ email });
        if (!isUserExist) {
            let username = await generateUsername(email);
            avatar = avatar?.replace("s96-c", "s384-c")
            const mewUser = await userModel.create({ name, username, email, avatar, google_auth: true })
            sendToken(mewUser, 200, res)
        } else {
            if (isUserExist.google_auth) {

                sendToken(isUserExist, 200, res)
            } else {
                return next(new ErrorHandler("this email was signed up without google . Please log in with password to access the account", 400))
            }

        }

    } catch (error: any) {
        return next(new ErrorHandler(error.message, 400))

    }

})
interface IUpdateUserInfo {
    name?: string;
    email?: string;
    username?: string;
    phoneNumber?: string;
    dateOfBirth?: Date;
    country?: string;
    bio?: string;
    blog: object
}

export const updateUserInfo = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { name, email, username, phoneNumber, dateOfBirth, country, bio, blog } = req.body as IUpdateUserInfo;
            const userId = req.user?._id as string;
            const user = await userModel.findById(userId);
            if (!user) {
                return next(new ErrorHandler("User not found", 404));
            }

            if (name) {
                user.name = name;
            }
            if (email) {
                const isEmailExist = await userModel.findOne({ email });
                if (isEmailExist) {
                    return next(new ErrorHandler("Email already exist", 400));
                }
                user.email = email;
            }

            if (bio) {
                user.bio = bio;
            }
            await user?.save();
            await redis.set(userId, JSON.stringify(user));

            res.status(200).json({
                success: true,
                user,
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
);

// update user password
interface IUpdatePassword {
    oldPassword: string;
    newPassword: string;
}

export const updatePassword = catchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { oldPassword, newPassword } = req.body as IUpdatePassword;

        if (!oldPassword || !newPassword) {
            return next(new ErrorHandler("Please enter old and new password", 400));
        }

        const userId = req.user?._id as string;
        const user = await userModel.findById(userId).select("+password");

        if (user?.password === undefined) {
            return next(new ErrorHandler("Invalid user", 400));
        }

        const isPasswordMatch = await user?.comparePassword(oldPassword);

        if (!isPasswordMatch) {
            return next(new ErrorHandler("Invalid old password", 400));
        }

        user.password = newPassword;
        await user.save();
        await redis.set(userId, JSON.stringify(user));

        res.status(201).json({
            success: true,
            message: "Password updated successfully",
            user,
        });
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 400));
    }
})


// update the avatar profile picture 

export const updateAvatar = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { avatar } = req.body;
            const userId = req.user?._id as string;
            const user = await userModel.findById(userId);
            if (!user) {
                return next(new ErrorHandler("User not found", 400));
            }
            if (avatar && user) {
                try {
                    // Upload new avatar using ImageKit
                    const uploadResult = await imageKit.uploadFile(avatar, {
                        fileName: `avatar_${user._id}_${Date.now()}`,
                        folder: "avatars",
                        useUniqueFileName: true,
                        transformation: [
                            {
                                width: 150,
                                height: 150,
                                crop: "force",
                                quality: 85,
                                format: "webp"
                            }
                        ],
                        tags: ["avatar", "user-profile"]
                    });

                    if (!uploadResult.success) {
                        return next(new ErrorHandler(uploadResult.error || "Failed to upload avatar", 400));
                    }

                    // Update user avatar with ImageKit data
                    user.avatar = {
                        public_id: uploadResult.data!.fileId,
                        url: uploadResult.data!.url,
                    };
                } catch (error: any) {
                    return next(new ErrorHandler(`Avatar upload failed: ${error.message}`, 400));
                }
            }
            await user.save();
            await redis.set(userId, JSON.stringify(user));
            res.status(201).json({
                success: true,
                message: "Avatar updated successfully",
                user,
            });
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
);
// add f follower user_id  to author
export const addFlower = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?._id;
            const { authorId } = req.body._id;
            if (userId && authorId) {
                const author = await userModel.findByIdAndUpdate(authorId, {
                    $push: {
                        followers: userId,
                    },
                });

            }
            res.status(201).json({
                success: true,
                message: "Flowers added successfully",
                authorId,
            });

        }

        catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
);

// add following 
export const addFollowing = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?._id;
            const { authorId } = req.body._id;
            if (userId && authorId) {
                const author = await userModel.findByIdAndUpdate(authorId, {
                    $push: {
                        following: userId,
                    },
                });

            }
            res.status(201).json({
                success: true,
                message: "Following added successfully",
                authorId,
            });

        }

        catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
);
// del follower
export const delFlowers = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?._id;
            const { authorId } = req.body._id;
            if (userId && authorId) {
                const author = await userModel.findByIdAndUpdate(authorId, {
                    $pull: {
                        followers: userId,
                    },
                });

            }
            res.status(201).json({
                success: true,
                message: "Flowers deleted successfully",
                authorId,
            });

        }

        catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
);
// del following
export const delFollowing = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?._id;
            const { authorId } = req.body._id;
            if (userId && authorId) {
                const author = await userModel.findByIdAndUpdate(authorId, {
                    $pull: {
                        following: userId,
                    },
                });

            }
            res.status(201).json({
                success: true,
                message: "Following deleted successfully",
                authorId,
            });

        }

        catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
);
// get all users  --only for admin 
export const getAllUsers = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            getAllUsersService(res)

        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400))
        }
    }
)

// udpate user role 
export const updateUserRole = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId, role } = req.body;
            if (!userId || !role) {
                return next(new ErrorHandler("user and role are required", 400))
            }
            updateUserRoleService(res, userId, role)
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
);
// delete user admin and user its self can delete his recorde but withe just user.isDeleted to true 
export const deleteUser = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId } = req.body;
            if (!userId) {
                return next(new ErrorHandler("user id is required", 400))
            }
            deleteUserService(res, userId)
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
);
// undelete user 
/* export const undeleteUser = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId } = req.body;
            if (!userId) {
                return next(new ErrorHandler("user id is required", 400))
            }
            undeleteUserService(res, userId)
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400))
        }
    }
)
// banned user 
export const bannedUser = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId } = req.body;
            if (!userId) {
                return next(new ErrorHandler("user id is required", 400))
            }
            bannedUserService(res, userId)
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
);
// unbanned user 
export const unbannedUser = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId } = req.body;
            if (!userId) {
                return next(new ErrorHandler("user id is required", 400))
            }
            unbannedUserService(res, userId)
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
)
// Suspended user 
export const suspendedUser = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId } = req.body;
            if (!userId) {
                return next(new ErrorHandler("user id is required", 400))
            }
            suspendedUserService(res, userId)
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
);
// unsuspended user 
export const unsuspendedUser = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId } = req.body;
            if (!userId) {
                return next(new ErrorHandler("user id is required", 400))
            }
            unsuspendedUserService(res, userId)
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
)
// verify user 
export const verifyUser = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId } = req.body;
            if (!userId) {
                return next(new ErrorHandler("user id is required", 400))
            }
            verifyUserService(res, userId)
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
)
// unverify user
export const unverifyUser = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId } = req.body;
            if (!userId) {
                return next(new ErrorHandler("user id is required", 400))
            }
            unverifyUserService(res, userId)
        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
) */