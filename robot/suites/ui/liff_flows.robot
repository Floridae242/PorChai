*** Settings ***
Documentation       UI & LIFF Webview test suite for Por-Chai using Browser Library (Playwright-backed).
Resource            ../../resources/variables.robot
Library             Browser

Suite Setup         New Browser    browser=chromium    headless=${HEADLESS}
Suite Teardown      Close Browser
Test Setup          New Context    viewport={'width': 390, 'height': 844}
Test Teardown       Close Context

*** Test Cases ***
TC-14: Form Validation For New Cycle Setup
    [Documentation]    Form must reject empty initial balance or missing payday without producing NaN.
    [Tags]             ui    validation    liff
    New Page           ${LIFF_URL}/setup

    # Try saving with empty inputs
    Click              button:has-text("บันทึก")
    
    # Assert validation error or disabled state
    Wait For Elements State    text="กรุณาระบุยอดเงิน"    visible    timeout=3s
    Get Text           body    not contains    NaN

TC-17: Double Submit Protection On Payment Confirmation
    [Documentation]    Button must disable immediately on first click to prevent duplicate ledger entries.
    [Tags]             ui    concurrency    double-submit
    # Set mock user cookie/storage to bypass setup
    New Page           ${LIFF_URL}/record
    
    # Fill actual spend 50 THB
    Fill Text          input[name="amount"]    50
    Fill Text          input[name="title"]     Lunch Test
    
    # Click confirm button rapidly
    Click              button:has-text("บันทึกจ่ายจริง")
    
    # Button should transition to disabled or loading state instantly
    Wait For Elements State    button:has-text("บันทึกจ่ายจริง")    disabled    timeout=1s

TC-20: Microsoft Clarity PII Masking Verification
    [Documentation]    Ensure financial figures and user identifiers carry clarity masking attributes.
    [Tags]             security    privacy    clarity
    New Page           ${LIFF_URL}/summary

    # Ensure sensitive balance container has masking class/attribute
    Wait For Elements State    [data-clarity-mask="true"], .clarity-mask, [data-testid="balance-mask"]    visible    timeout=5s
    ${classes}=        Get Attribute    [data-testid="balance-card"]    class
    Should Contain Any    ${classes}    clarity-mask    mask-text    secret

