"""
PulseNet — AWS Bedrock AI Service
====================================
Calls AWS Bedrock (Claude 3 Haiku) for operational insights.
Gracefully degrades if credentials are missing or Bedrock is unreachable.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from config import Settings

logger = logging.getLogger(__name__)


async def invoke_bedrock(
    prompt: str,
    settings: Settings,
    max_tokens: int = 1024,
) -> Optional[str]:
    """
    Send a prompt to AWS Bedrock and return the text response.
    Returns None if Bedrock is unavailable or fails.
    """
    import os
    if "AWS_SESSION_TOKEN" in os.environ:
        del os.environ["AWS_SESSION_TOKEN"]

    try:
        client = boto3.client(
            "bedrock-runtime",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None,
        )

        model_id = settings.BEDROCK_MODEL_ID

        # Claude 3 Haiku uses the Messages API
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            "temperature": 0.3,
        })

        response = client.invoke_model(
            modelId=model_id,
            body=body,
            contentType="application/json",
            accept="application/json",
        )

        response_body = json.loads(response["body"].read())

        # Extract text from Claude 3 response format
        if "content" in response_body and len(response_body["content"]) > 0:
            return response_body["content"][0].get("text", "")

        return response_body.get("completion", str(response_body))

    except ClientError as exc:
        logger.error("Bedrock API error: %s", exc)
        return None
    except Exception as exc:
        logger.error("Bedrock invocation failed: %s", exc)
        return None
