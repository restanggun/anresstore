import { Controller, Get, HttpException, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { adminDb } from "../admin/admin-store";
import { PaymentIdentityService } from "../payments/payment-identity";
import { PaymentStore } from "../payments/payment-store";

@Controller("campaign")
export class CampaignController {
  private readonly identities = new PaymentIdentityService();
  private readonly store = new PaymentStore();
  @Get("public")
  async publicCampaign(@Res({passthrough:true}) res:Response) {
    res.setHeader("Cache-Control","public, max-age=30, stale-while-revalidate=60");
    const [row]=await adminDb<{enabled:boolean;config:Record<string,unknown>}>("campaign_settings","?id=eq.1&select=enabled,config&limit=1");
    const config=row?.config??{};
    return {enabled:row?.enabled??false,title:config.title??"Misi Grand Opening",description:config.description??"",startsAt:config.startsAt??null,endsAt:config.endsAt??null,missions:Array.isArray(config.missions)?config.missions:[]};
  }
  @Get("me")
  async mine(@Req() req:Request,@Res({passthrough:true}) res:Response) {
    res.setHeader("Cache-Control","no-store");
    const identity=await this.identities.resolve(req,res);
    if(!identity.userId||!identity.emailVerified)throw new HttpException("Masuk dengan email terverifikasi untuk melihat misi.",401);
    return await this.store.rpc("campaign_user_snapshot",{p_user:identity.userId});
  }
}
