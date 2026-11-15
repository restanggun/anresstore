import { Body, Controller, Get, HttpException, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { PaymentIdentityService } from "./payment-identity";
import { adminDb } from "../admin/admin-store";
import { uuid } from "../help/conversations.controller";

@Controller("task-orders")
export class TaskOrdersController {
 private readonly identity=new PaymentIdentityService();
 private async owner(req:Request,res:Response,write=false){
  res.setHeader("Cache-Control","no-store");
  if(write && !(process.env.CORS_ORIGINS||"http://localhost:3000,http://localhost:3001").split(",").map(s=>s.trim()).includes(req.headers.origin||"")) throw new HttpException("Origin tidak diizinkan.",403);
  const {userId}=await this.identity.resolve(req,res);
  if(!userId) throw new HttpException("Masuk untuk mengelola tugas.",401);
  return userId;
 }
 private async payment(id:string,user:string){
  if(!uuid(id)) throw new HttpException("Tugas tidak ditemukan.",404);
  const [row]=await adminDb<{id:string;status:string;invoice_number:string;amount:number}>("payments",`?id=eq.${id}&owner_user_id=eq.${user}&source=eq.tasks&select=id,status,invoice_number,amount`);
  if(!row) throw new HttpException("Tugas tidak ditemukan.",404);
  return row;
 }
 @Get(":id") async detail(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response){
  const user=await this.owner(req,res),payment=await this.payment(id,user);
  const [task]=await adminDb("task_order_specs",`?payment_id=eq.${id}&select=*`);
  if(!task) throw new HttpException("Tugas belum tersedia.",404);
  const revisions=await adminDb("task_revisions",`?payment_id=eq.${id}&select=*&order=created_at.asc`);
  return {payment,task,revisions};
 }
 @Post(":id/revisions") async revise(@Param("id") id:string,@Body() body:{id?:unknown;note?:unknown},@Req() req:Request,@Res({passthrough:true}) res:Response){
  const user=await this.owner(req,res,true);await this.payment(id,user);
  if(!uuid(body?.id)||typeof body?.note!=="string"||body.note.trim().length<10||body.note.length>2000)throw new HttpException("Isi alasan revisi 10 sampai 2000 karakter.",400);
  const [revision]=await adminDb("rpc/request_task_revision","","POST",{p_payment:id,p_user:user,p_id:body.id,p_note:body.note});
  return {revision};
 }
 @Post(":id/complete") async complete(@Param("id") id:string,@Req() req:Request,@Res({passthrough:true}) res:Response){
  const user=await this.owner(req,res,true);await this.payment(id,user);
  const [task]=await adminDb("rpc/complete_task_order","","POST",{p_payment:id,p_user:user});
  return {task};
 }
}
