import logging
from fastapi import APIRouter, Form, Depends, HTTPException, Request, Response
from twilio.twiml.messaging_response import MessagingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, RequirementResponse, Requirement, Cycle, Bridge, BridgeMember
from sqlalchemy import func

logger = logging.getLogger("pulsenet")

router = APIRouter()

@router.post("/twilio/whatsapp")
async def twilio_whatsapp_webhook(
    request: Request,
    From: str = Form(None),
    Body: str = Form(None),
    ButtonText: str = Form(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Receives incoming WhatsApp messages from Twilio Sandbox.
    """
    form_data = await request.form()
    print("====== TWILIO WEBHOOK HIT ======")
    print(f"FULL PAYLOAD: {dict(form_data)}")
    
    # Use ButtonText if provided (Quick Replies), fallback to Body
    actual_body = ButtonText if ButtonText else Body
    
    print(f"From: {From} | Body: {Body} | ButtonText: {ButtonText} | Actual: {actual_body}")
    
    resp = MessagingResponse()
    
    if not From or not actual_body:
        print("WARNING: Missing From or Body!")
        resp.message("Invalid payload.")
        return Response(content=str(resp), media_type="application/xml")

    phone = From.replace("whatsapp:", "").strip()
    # Assume number formats might not perfectly align; we match right side.
    if phone.startswith("+"):
        pass # Twilio format is usually '+91XXXXXXXXXX'
        
    # 1. Find Donors with this phone number
    result = await db.execute(select(User.id).where(User.phone == phone).where(User.role == "Donor"))
    donor_ids = [row[0] for row in result.all()]
    
    if not donor_ids:
        resp.message("Sorry, we couldn't find a registered donor with this phone number.")
        return Response(content=str(resp), media_type="application/xml")

    # 2. Find pending requirement response across ANY of these donors
    result = await db.execute(
        select(RequirementResponse)
        .where(RequirementResponse.donor_id.in_(donor_ids))
        .where(RequirementResponse.status == "pending")
        .order_by(RequirementResponse.created_at.desc())
        .limit(1)
    )
    req_resp = result.scalar_one_or_none()

    if not req_resp:
        resp.message("We don't have any pending requests for you right now, but thank you!")
        return Response(content=str(resp), media_type="application/xml")

    body_lower = actual_body.strip().lower()
    print(f"Evaluating response: {body_lower}")
    
    if body_lower in ["1", "yes", "confirm", "confirmed"]:
        # Check waitlist logic
        req = await db.get(Requirement, req_resp.requirement_id)
        if req and req.cycle_id:
            cycle = await db.get(Cycle, req.cycle_id)
            if cycle:
                expected = cycle.expected_units
                
                # Get confirmed count
                count_res = await db.execute(
                    select(func.count(RequirementResponse.id))
                    .where(RequirementResponse.requirement_id == req.id)
                    .where(RequirementResponse.status == "confirmed")
                )
                confirmed_count = count_res.scalar_one_or_none() or 0
                
                # Check if donor is a backup
                bridge_res = await db.execute(
                    select(Bridge.id).where(Bridge.patient_id == cycle.patient_id)
                )
                bridge_id = bridge_res.scalar_one_or_none()
                
                is_backup = False
                if bridge_id:
                    bm_res = await db.execute(
                        select(BridgeMember.is_backup)
                        .where(BridgeMember.bridge_id == bridge_id)
                        .where(BridgeMember.donor_id == req_resp.donor_id)
                    )
                    is_backup = bm_res.scalar_one_or_none() or False
                
                if is_backup and confirmed_count >= expected:
                    req_resp.status = "waitlisted"
                    print("STATUS SET TO WAITLISTED (Backup Donor limit reached)")
                    resp.message("Thank you! We already have enough units confirmed for now, but we've placed you on the waitlist in case someone cancels.")
                else:
                    req_resp.status = "confirmed"
                    print("STATUS SET TO CONFIRMED")
                    resp.message("Confirmed! Your donation is scheduled. Thank you for being a Blood Warrior!")
            else:
                req_resp.status = "confirmed"
                print("STATUS SET TO CONFIRMED")
                resp.message("Confirmed! Your donation is scheduled. Thank you for being a Blood Warrior!")
        else:
            req_resp.status = "confirmed"
            print("STATUS SET TO CONFIRMED")
            resp.message("Confirmed! Your donation is scheduled. Thank you for being a Blood Warrior!")
    elif body_lower in ["2", "no", "cancel", "declined"]:
        req_resp.status = "declined"
        resp.message("Understood. We'll update you when needed next. Thank you!")
    else:
        resp.message("Please reply with '1' to confirm YES, or '2' for NO.")

    await db.commit()
    return Response(content=str(resp), media_type="application/xml")
