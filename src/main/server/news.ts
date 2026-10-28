import { z } from 'zod';
import { secureFetch, limitedBytes, httpsUrl } from '../security/network';
import type { NewsItem } from '../../shared/types';
const schema=z.object({items:z.array(z.object({id:z.string().min(1).max(100),title:z.string().min(1).max(180),date:z.string().datetime(),summary:z.string().max(700),content:z.string().max(16000).optional(),url:z.string().url().optional(),image:z.string().url().optional()}).strict()).max(100)}).strict();
export async function fetchNews(url:string):Promise<NewsItem[]> {
  const result=schema.parse(JSON.parse((await limitedBytes(await secureFetch(url),1024*1024)).toString('utf8')));
  return Promise.all(result.items.map(async item=>{
    if(item.url)httpsUrl(item.url); let image:string|undefined;
    if(item.image) { try {const response=await secureFetch(item.image); const bytes=await limitedBytes(response,2*1024*1024);const type=response.headers.get('content-type')?.split(';')[0];if(type && ['image/png','image/jpeg','image/webp'].includes(type))image=`data:${type};base64,${bytes.toString('base64')}`;}catch{} }
    return {...item,image};
  }));
}
