*** Settings ***
Documentation       UI & LIFF Webview test suite using SeleniumLibrary.
Library             SeleniumLibrary

Suite Setup         Open Mobile Browser
Suite Teardown      Close All Browsers

*** Variables ***
${BASE_URL}         http://localhost:3004
${LIFF_RECORD_URL}  ${BASE_URL}/app/record/new

*** Keywords ***
Open Mobile Browser
    ${opts}=    Evaluate    sys.modules['selenium.webdriver'].ChromeOptions()    sys
    Call Method    ${opts}    add_argument    --window-size\=412,915
    Call Method    ${opts}    add_experimental_option    mobileEmulation    ${{ {'deviceName': 'Pixel 7'} }}
    Create Webdriver    Chrome    options=${opts}
    Set Selenium Implicit Wait    5s

*** Test Cases ***
TC-17: Double Submit Protection on Record Expense
    [Documentation]    Fill expense and click save twice quickly; check the result by eye / screenshot.
    [Tags]             ui    liff    tc-17
    Go To              ${LIFF_RECORD_URL}
    Wait Until Page Contains Element    xpath=//input    timeout=10s
    Input Text         xpath=(//input)[1]    45
    Input Text         xpath=(//input)[2]    ข้าว
    Click Button       xpath=//button[contains(., 'บันทึก')]
    Click Button       xpath=//button[contains(., 'บันทึก')]
    Sleep              3s
    Capture Page Screenshot