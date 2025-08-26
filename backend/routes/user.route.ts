import express from 'express';
import { activateUser, addFlower, addFollowing, delFlowers, delFollowing, getAllUsers, getUserInfo, loginUser, logoutUser, registrationUser, socialAuth, updateAccessToken, updateAvatar, updatePassword, updateUserInfo, updateUserRole } from '../controllers/user.controller';
import { authorizeRoles, isAuthenticatedUser } from '../middlewares/auth';
import { authLimiter } from '../middlewares/rateLimite';


const userRouter = express.Router();

userRouter.post('/registration', authLimiter, registrationUser);
userRouter.post('/activation', authLimiter, activateUser);
userRouter.post('/login', authLimiter, loginUser);
userRouter.get('/logout', isAuthenticatedUser, logoutUser)
userRouter.get('/refresh', authLimiter, updateAccessToken)
userRouter.get('/me', authLimiter, isAuthenticatedUser, getUserInfo)
userRouter.post('/social-auth', authLimiter, socialAuth)
userRouter.put('/update-user', authLimiter, isAuthenticatedUser, updateUserInfo)
userRouter.put('/update-user-password', authLimiter, isAuthenticatedUser, updatePassword)
userRouter.put('/update-user-Avatar', authLimiter, isAuthenticatedUser, updateAvatar)
//TODO: test those follwing route in postman later ::
//! don't uset beffor 
// add follower to user 
userRouter.put('/add-follower', authLimiter, isAuthenticatedUser, addFlower)
// del follower to user
userRouter.put('/del-follower', authLimiter, isAuthenticatedUser, delFlowers)
// add following to user 
userRouter.put('/add-following', authLimiter, isAuthenticatedUser, addFollowing)
// del following to user
userRouter.put('/del-following', authLimiter, isAuthenticatedUser, delFollowing)
// get all users only for admin 
userRouter.get('/all-users', authLimiter, isAuthenticatedUser, authorizeRoles("admin"), getAllUsers)
// update user role route
userRouter.put('/update-user-role', authLimiter, isAuthenticatedUser, authorizeRoles("admin"), updateUserRole)

export default userRouter;