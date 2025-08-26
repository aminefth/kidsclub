import { Request, Response, NextFunction } from 'express';

// Extend Request interface to include apiVersion
declare global {
  namespace Express {
    interface Request {
      apiVersion: string;
    }
  }
}

/**
 * API Versioning middleware for professional version management
 */
export const apiVersioning = (req: Request, res: Response, next: NextFunction) => {
  // Extract version from URL path or headers
  const urlVersion = req.path.match(/^\/api\/v(\d+)/)?.[1];
  const headerVersion = req.headers['api-version'] as string;
  const acceptHeader = req.headers.accept;
  
  // Determine API version (priority: URL > Header > Accept > Default)
  let version = urlVersion || headerVersion;
  
  if (!version && acceptHeader) {
    const versionMatch = acceptHeader.match(/application\/vnd\.kidsclub\.v(\d+)/);
    version = versionMatch?.[1] || '1';
  }
  
  // Default to v1 if no version specified
  version = version || '1';
  
  // Add version info to request object
  req.apiVersion = version || 'v1';
  
  // Add version info to response headers
  res.setHeader('API-Version', version);
  res.setHeader('Supported-Versions', '1');
  
  // Check if version is supported
  const supportedVersions = ['1'];
  if (!supportedVersions.includes(version)) {
    return res.status(400).json({
      success: false,
      error: 'Unsupported API version',
      supportedVersions,
      requestedVersion: version
    });
  }
  
  next();
};

/**
 * Deprecation warning middleware
 */
export const deprecationWarning = (version: string, deprecatedIn: string, removedIn: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).apiVersion === version) {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', new Date(removedIn).toISOString());
      res.setHeader('Link', '</api/v2>; rel="successor-version"');
      
      // Add deprecation warning to response
      const originalJson = res.json;
      res.json = function(body: any) {
        if (body && typeof body === 'object') {
          body._deprecation = {
            version,
            message: `API version ${version} is deprecated since ${deprecatedIn} and will be removed on ${removedIn}`,
            upgradeUrl: '/api/v2'
          };
        }
        return originalJson.call(this, body);
      };
    }
    next();
  };
};
