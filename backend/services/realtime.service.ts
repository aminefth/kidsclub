import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { IUser } from '../models/user.model';
import { INotification } from '../models/notification.model';
import { UserActivityModel } from '../models/analytics.model';

interface AuthenticatedSocket extends Socket {
    userId?: string;
    user?: IUser;
}

class RealtimeService {
    private io: SocketIOServer;
    private connectedUsers: Map<string, string[]> = new Map(); // userId -> socketIds[]

    constructor(server: HttpServer) {
        this.io = new SocketIOServer(server, {
            cors: {
                origin: process.env.FRONTEND_URL || "http://localhost:3000",
                methods: ["GET", "POST"],
                credentials: true
            }
        });

        this.setupMiddleware();
        this.setupEventHandlers();
    }

    private setupMiddleware() {
        // Authentication middleware
        this.io.use(async (socket: AuthenticatedSocket, next) => {
            try {
                const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
                
                if (!token) {
                    return next(new Error('Authentication error'));
                }

                const decoded = jwt.verify(token, process.env.ACCESS_TOKEN as string) as any;
                socket.userId = decoded.id;
                socket.user = decoded.user;
                
                next();
            } catch (error) {
                next(new Error('Authentication error'));
            }
        });
    }

    private setupEventHandlers() {
        this.io.on('connection', (socket: AuthenticatedSocket) => {
            console.log(`User ${socket.userId} connected`);
            
            // Track connected user
            this.addUserSocket(socket.userId!, socket.id);
            
            // Join user to their personal room
            socket.join(`user:${socket.userId}`);
            
            // Handle real-time events
            this.handleCommentEvents(socket);
            this.handleNotificationEvents(socket);
            this.handleAnalyticsEvents(socket);
            this.handleKidsClubEvents(socket);
            
            socket.on('disconnect', () => {
                console.log(`User ${socket.userId} disconnected`);
                this.removeUserSocket(socket.userId!, socket.id);
            });
        });
    }

    private handleCommentEvents(socket: AuthenticatedSocket) {
        // Join blog room for real-time comments
        socket.on('join-blog', (blogId: string) => {
            socket.join(`blog:${blogId}`);
            console.log(`User ${socket.userId} joined blog ${blogId}`);
        });

        socket.on('leave-blog', (blogId: string) => {
            socket.leave(`blog:${blogId}`);
        });

        // Handle typing indicators
        socket.on('typing-start', (data: { blogId: string, parentId?: string }) => {
            socket.to(`blog:${data.blogId}`).emit('user-typing', {
                userId: socket.userId,
                user: socket.user,
                parentId: data.parentId
            });
        });

        socket.on('typing-stop', (data: { blogId: string }) => {
            socket.to(`blog:${data.blogId}`).emit('user-stopped-typing', {
                userId: socket.userId
            });
        });
    }

    private handleNotificationEvents(socket: AuthenticatedSocket) {
        // Mark notifications as read
        socket.on('mark-notification-read', (notificationId: string) => {
            // Update notification in database
            // Emit to user's other sessions
            socket.to(`user:${socket.userId}`).emit('notification-read', notificationId);
        });

        // Real-time notification preferences
        socket.on('update-notification-settings', (settings: any) => {
            // Update user notification preferences
            socket.emit('notification-settings-updated', settings);
        });
    }

    private handleAnalyticsEvents(socket: AuthenticatedSocket) {
        // Track article reading
        socket.on('article-view-start', async (data: { blogId: string, sessionId: string }) => {
            // Track view start
            await UserActivityModel.create({
                userId: socket.userId,
                sessionId: data.sessionId,
                action: 'view',
                resourceType: 'blog',
                resourceId: data.blogId,
                metadata: {
                    userAgent: socket.handshake.headers['user-agent']
                }
            });
        });

        socket.on('article-view-end', async (data: { 
            blogId: string, 
            sessionId: string, 
            readTime: number,
            scrollDepth: number 
        }) => {
            // Update view with read time and scroll depth
            await UserActivityModel.findOneAndUpdate(
                {
                    userId: socket.userId,
                    sessionId: data.sessionId,
                    resourceId: data.blogId,
                    action: 'view'
                },
                {
                    $set: {
                        'metadata.readTime': data.readTime,
                        'metadata.scrollDepth': data.scrollDepth
                    }
                }
            );
        });
    }

    private handleKidsClubEvents(socket: AuthenticatedSocket) {
        // Kids-specific room management
        socket.on('join-kids-room', (ageGroup: string) => {
            socket.join(`kids:${ageGroup}`);
        });

        // Parental control events
        socket.on('parental-control-activated', (data: { childUserId: string }) => {
            this.io.to(`user:${data.childUserId}`).emit('parental-control-enabled');
        });

        // Educational progress tracking
        socket.on('kids-progress-update', (data: { 
            activityId: string, 
            progress: number, 
            completed: boolean 
        }) => {
            // Track educational progress
            // Notify parents if configured
        });
    }

    // Public methods for emitting events from controllers
    public emitNewComment(blogId: string, comment: any) {
        this.io.to(`blog:${blogId}`).emit('new-comment', comment);
    }

    public emitCommentReaction(blogId: string, commentId: string, reaction: any) {
        this.io.to(`blog:${blogId}`).emit('comment-reaction', {
            commentId,
            reaction
        });
    }

    public emitNotification(userId: string, notification: INotification) {
        this.io.to(`user:${userId}`).emit('new-notification', notification);
    }

    public emitBlogUpdate(blogId: string, update: any) {
        this.io.to(`blog:${blogId}`).emit('blog-updated', update);
    }

    public emitKidsActivityUpdate(ageGroup: string, activity: any) {
        this.io.to(`kids:${ageGroup}`).emit('kids-activity-update', activity);
    }

    // User connection management
    private addUserSocket(userId: string, socketId: string) {
        const userSockets = this.connectedUsers.get(userId) || [];
        userSockets.push(socketId);
        this.connectedUsers.set(userId, userSockets);
    }

    private removeUserSocket(userId: string, socketId: string) {
        const userSockets = this.connectedUsers.get(userId) || [];
        const filteredSockets = userSockets.filter(id => id !== socketId);
        
        if (filteredSockets.length === 0) {
            this.connectedUsers.delete(userId);
        } else {
            this.connectedUsers.set(userId, filteredSockets);
        }
    }

    public isUserOnline(userId: string): boolean {
        return this.connectedUsers.has(userId);
    }

    public getOnlineUsersCount(): number {
        return this.connectedUsers.size;
    }
}

export default RealtimeService;
