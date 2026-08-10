/* config.js — Supabase 连接参数。
   这两个值是设计上就要嵌进客户端的公开值，不是密钥：
   anon key 能做什么完全由数据库的行级权限（RLS）决定，
   而 entries 表的策略规定「只能读写 auth.uid() 等于自己的行」，
   所以别人拿到这串 key 也读不到你的任何一条记录。
*/

export const SUPABASE_URL = "https://qsqcmsznxhuwjrjnihob.supabase.co";

export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzcWNtc3pueGh1d2pyam5paG9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNTQ5MzksImV4cCI6MjEwMTkzMDkzOX0.6fUOg60_IQeAZGzIquTVj_hJa6CcW6C2hWTSmzodUD4";
