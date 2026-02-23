export function getDeviceContext() {
  const ua = navigator.userAgent;
  let deviceType = 'desktop';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    deviceType = 'mobile';
  } else if (/tablet|ipad/i.test(ua.toLowerCase())) {
    deviceType = 'tablet';
  }

  let os = 'Unknown';
  if (ua.indexOf('Win') !== -1) os = 'Windows';
  else if (ua.indexOf('Mac') !== -1) os = 'MacOS';
  else if (ua.indexOf('X11') !== -1) os = 'UNIX';
  else if (ua.indexOf('Linux') !== -1) os = 'Linux';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';

  let browser = 'Unknown';
  if (ua.indexOf('Firefox') !== -1) browser = 'Firefox';
  else if (ua.indexOf('Chrome') !== -1) browser = 'Chrome';
  else if (ua.indexOf('Safari') !== -1) browser = 'Safari';
  else if (ua.indexOf('Edge') !== -1) browser = 'Edge';
  else if (ua.indexOf('Trident') !== -1) browser = 'Internet Explorer';

  return { deviceType, os, browser };
}
