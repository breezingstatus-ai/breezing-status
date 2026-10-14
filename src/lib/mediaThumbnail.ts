import {MediaAsset} from '../types';
// Apply sizing AFTER branding transforms. Video cards request a still image, never a video stream.
export function mediaThumbnail(asset:Pick<MediaAsset,'secure_url'|'resource_type'|'thumbnail_url'>):string {
 if(asset.thumbnail_url) return asset.thumbnail_url;
 const url=asset.secure_url;
 if(!url?.startsWith('https://res.cloudinary.com/')||!url.includes('/upload/'))return '';
 const transform=asset.resource_type==='video'?'so_0,c_fill,w_160,h_160,q_35,f_jpg':'c_fill,w_160,h_160,q_35,f_auto';
 const version=url.match(/\/v\d+\//);
 let small=version?url.replace(version[0],`/${transform}${version[0]}`):url.replace('/upload/',`/upload/${transform}/`);
 if(asset.resource_type==='video')small=small.replace(/\.[a-z0-9]+(?:\?.*)?$/i,'.jpg');
 return small;
}
