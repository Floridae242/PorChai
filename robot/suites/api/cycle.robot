*** Settings ***
Documentation       API Suite for Por-Chai Cycle Calculation and Financial Rules (R1–R13).
Resource            ../../resources/variables.robot
Library             RequestsLibrary
Library             Collections

*** Test Cases ***
TC-01 to TC-03: Simulate, Reserve, and Spend Central Example
    [Documentation]    Validates central financial calculation: 1,000 THB, 300 THB bill, 7 days.
    [Tags]             api    calculation    R2    R3-quarter
    Create Session     porchai    ${BASE_URL}    headers=&{AUTH_HEADERS_USER_A}

    # Step 1: Initialize Cycle (1,000 THB, 7 days, 300 THB bill)
    ${payday7}=        Evaluate             (datetime.date.today() + datetime.timedelta(days=7)).isoformat()    modules=datetime
    ${bill}=           Create Dictionary    title=Rent    amount=30000    dueOn=${payday7}    status=reserved
    ${bills}=          Create List          ${bill}
    ${payload}=        Create Dictionary    balance=100000    incomeSource=family    incomeFrequency=monthly    payday=${payday7}    bills=${bills}
    ${resp}=           POST On Session      porchai    /api/cycle    json=${payload}    expected_status=any
    Should Be Equal As Integers    ${resp.status_code}    200

    # Step 2: Validate Summary - Pre-Trial (700 THB usable, 100 THB/day)
    ${summary}=        GET On Session       porchai    /api/summary
    Should Be Equal As Integers    ${summary.status_code}    200
    ${data}=           Set Variable         ${summary.json()}
    Should Be Equal As Integers    ${data['usable']}         70000
    Should Be Equal As Integers    ${data['dailyBudget']}    10000

    # Step 3: Simulate Purchase 140 THB (TC-01: usable 560 THB, daily 80 THB)
    ${sim_body}=       Create Dictionary    amount=14000    name=Shirt
    ${sim_resp}=       POST On Session      porchai    /api/simulate    json=${sim_body}
    Should Be Equal As Integers    ${sim_resp.status_code}   200
    ${sim_data}=       Set Variable         ${sim_resp.json()}
    Should Be Equal As Integers    ${sim_data['usable']}     56000
    Should Be Equal As Integers    ${sim_data['dailyBudget']} 8000

TC-04: Validate Quarter Baht Floor Rounding (R3-quarter)
    [Documentation]    Validates 700 THB / 3 days rounds down to 233.25 THB (23,325 satang), not 233.33.
    [Tags]             api    rounding    R3-quarter
    Create Session     porchai    ${BASE_URL}    headers=&{AUTH_HEADERS_USER_A}

    ${payday3}=        Evaluate             (datetime.date.today() + datetime.timedelta(days=3)).isoformat()    modules=datetime
    ${payload}=        Create Dictionary    balance=70000    incomeSource=family    incomeFrequency=monthly    payday=${payday3}    bills=@{EMPTY}
    ${resp}=           POST On Session      porchai    /api/cycle    json=${payload}    expected_status=any
    Should Be Equal As Integers    ${resp.status_code}    200

    ${summary}=        GET On Session       porchai    /api/summary
    ${data}=           Set Variable         ${summary.json()}
    Should Be Equal As Integers    ${data['dailyBudget']}    23325
    # Verify exact multiple of 25 satang
    ${mod}=            Evaluate             ${data['dailyBudget']} % 25
    Should Be Equal As Integers    ${mod}    0

TC-19: Enforce User Data Isolation
    [Documentation]    Ensures User B cannot access User A's cycle summary or financial records.
    [Tags]             security    isolation    P-16
    Create Session     session_a    ${BASE_URL}    headers=&{AUTH_HEADERS_USER_A}
    Create Session     session_b    ${BASE_URL}    headers=&{AUTH_HEADERS_USER_B}

    # User A creates cycle
    ${payload}=        Create Dictionary    balance=50000    payday=2026-11-20
    ${resp_a}=         POST On Session      session_a    /api/cycle    json=${payload}
    Should Be Equal As Integers    ${resp_a.status_code}    200

    # User B requests summary (must be independent, empty, or uninitialized)
    ${resp_b}=         GET On Session       session_b    /api/summary
    Run Keyword If     ${resp_b.status_code} == 200
    ...                Should Not Be Equal As Integers    ${resp_b.json().get('balance', 0)}    50000

