@echo off
echo ========================================================
echo Pushing Dr. Pau Clinic PEP Registry to GitHub
echo Target: https://github.com/Delapena16/clinicpau.git
echo ========================================================
git add .
git commit -m "Update Dr. Pau ABTC PEP Registry: Capstone analytics dashboard, filter UI, sticky topbar and fixes"
git branch -M main
git push -u origin main
echo.
echo ========================================================
echo Done! Check https://github.com/Delapena16/clinicpau
echo ========================================================
pause
