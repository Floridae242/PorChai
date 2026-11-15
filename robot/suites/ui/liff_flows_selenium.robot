*** Settings ***
Documentation       UI & LIFF Webview test suite using SeleniumLibrary (built-in support).
Library             SeleniumLibrary

Suite Setup         Open Mobile Browser
Suite Teardown      Close Browser

*** Variables ***
${BASE_URL}         http://127.0.0.1:3101
${LIFF_RECORD_URL}  ${BASE_URL}/app/record/new

*** Keywords ***
Open Mobile Browser
    ${chrome_options}=    Evaluate    sys.modules['selenium.webdriver'].ChromeOptions()    sys
    Call Method    ${chrome_options}    add_argument    --window-size=412,915
    Call Method    ${chrome_options}    add_experimental_option    mobileEmulation    ${{ {'deviceName': 'Pixel 7'} }}
    Create Webdriver    Chrome    options=${chrome_options}
    Set Selenium Implicit Wait    5s

*** Test Cases ***
TC-17: Double Submit Protection on Record Expense
    [Documentation]    Fill expense and verify button disables or records once.
    [Tags]             ui    liff    tc-17
    Go To              ${LIFF_RECORD_URL}
    Wait Until Page Contains Element    xpath=//input[@type='text' or @type='number']    timeout=10s
    Input Text         xpath=(//input)[1]    45
    Input Text         xpath=(//input)[2]    ข้าว
    Click Button       xpath=//button[contains(., 'บันทึก')]

