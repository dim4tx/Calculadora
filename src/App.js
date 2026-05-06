import React, { useState, useEffect } from 'react';
import { Calendar, Save, ChevronRight, ChevronLeft, Edit2, X, Check, Download, Cloud } from 'lucide-react';
import { db, auth } from './firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const App = () => {
  const [currentView, setCurrentView] = useState('paso1');
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(null);
  const [showMonthlyHistory, setShowMonthlyHistory] = useState(false);
  const [completedSteps, setCompletedSteps] = useState({
    paso1: false,
    paso2: false
  });

  const [currentDate] = useState(new Date().toISOString().split('T')[0]);
  const [isDayCompleted, setIsDayCompleted] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));
  const [isLastDayOfMonth, setIsLastDayOfMonth] = useState(false);

  const [todayData, setTodayData] = useState({
    date: new Date().toISOString().split('T')[0],
    paso1: {
      dato1: '',
      dato2: '',
      total: 0,
      acumuladoAnterior: 0,
      acumulado: 0,
      totalDiaAnterior: 0
    },
    paso2: {
      dato1: '',
      dato2: '',
      total: 0,
      acumuladoAnterior: 0,
      acumulado: 0,
      totalDiaAnterior: 0
    },
    porcentaje: 0
  });

  const [historicalData, setHistoricalData] = useState({});
  const [monthlyData, setMonthlyData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [cloudStatus, setCloudStatus] = useState('⏳ Conectando...');
  const [isSessionAuthenticated, setIsSessionAuthenticated] = useState(false);
  const [loginCedula, setLoginCedula] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [sessionUserId, setSessionUserId] = useState(() => localStorage.getItem('sessionUserId') || '');
  const [sessionUsersMap, setSessionUsersMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sessionUsersMap') || '{}');
    } catch (e) {
      return {};
    }
  });

  // ===================== ESTADOS PARA LIMPIEZA VISUAL =====================
  const [showCleanModal, setShowCleanModal] = useState(false);
  const [selectedMonthToClean, setSelectedMonthToClean] = useState('');

  // ===================== HELPER: obtener el último día del mes =====================
  const getLastDayOfMonth = (monthKey) => {
    const [year, month] = monthKey.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return `${monthKey}-${String(lastDay).padStart(2, '0')}`;
  };

  // ===================== HELPER: verificar si una fecha es el último día de su mes =====================
  const isLastDayOfItsMonth = (dateStr) => {
    return dateStr === getLastDayOfMonth(dateStr.slice(0, 7));
  };

  // ===================== HELPER: verificar si se puede editar una fecha =====================
  const canEditDate = (dateStr) => {
    const mesDelaFecha = dateStr.slice(0, 7);
    if (mesDelaFecha === currentMonth) return true;
    // Mes anterior (o cualquier mes pasado): permitir editar si el día ya existe
    if (mesDelaFecha < currentMonth && historicalData?.[dateStr]) return true;
    if (mesDelaFecha < currentMonth && isLastDayOfItsMonth(dateStr)) return true;
    return false;
  };

  // ===================== HELPER: fecha/hora Colombia (ISO -05:00) =====================
  const getNowColombiaISO = () => {
    // Colombia no maneja DST, offset fijo -05:00
    const now = new Date();
    const dtf = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    // sv-SE => "YYYY-MM-DD HH:mm:ss"
    const localBogota = dtf.format(now).replace(' ', 'T');
    return `${localBogota}-05:00`;
  };

  // ===================== PERMISOS (usuarios limitados) =====================
  const effectiveSessionUserId = sessionUserId || localStorage.getItem('sessionUserId') || '';
  const LIMITED_USER_IDS = ['sandra_diaz', 'jhony_sanchez'];
  const isLimitedUser = LIMITED_USER_IDS.includes(effectiveSessionUserId);
  const yesterdayISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  })();
  const canLimitedUserWorkOnDate = (dateStr) => dateStr === yesterdayISO;

  // ===================== FUNCIONES JSON =====================
  const exportAllDataToJSON = () => {
    try {
      if (isLimitedUser) {
        alert('⛔ Tu usuario no tiene permisos para descargar reportes o backups.');
        return;
      }
      const exportData = {
        fechaExportacion: new Date().toISOString(),
        aplicacion: 'Calculadora Diaria',
        datosDiarios: historicalData,
        resumenesMensuales: monthlyData,
        estadisticas: {
          totalDias: Object.keys(historicalData).length,
          totalMeses: Object.keys(monthlyData).length,
          ultimoMes: currentMonth,
          diaActualCompletado: isDayCompleted
        }
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `backup_datos_${currentDate}.json`;
      link.click();

      alert(`✅ Backup exportado exitosamente!\n\n📊 Contenido:\n• ${Object.keys(historicalData).length} días registrados\n• ${Object.keys(monthlyData).length} meses resumidos\n\n💾 Archivo: backup_datos_${currentDate}.json`);

    } catch (error) {
      console.error('Error exportando JSON:', error);
      alert('❌ Error al exportar los datos. Intenta nuevamente.');
    }
  };

  const importData = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        setCloudStatus('⏳ Importando backup...');
        const importedData = JSON.parse(e.target.result);

        console.log('📥 Datos importados:', importedData);

        let datosImportados = importedData.datosDiarios || importedData.historicalData || importedData;
        let resumenesImportados = importedData.resumenesMensuales || importedData.monthlyData || {};

        if (Object.keys(datosImportados).length === 0) {
          throw new Error('El archivo no contiene datos válidos');
        }

        if (user) {
          try {
            setCloudStatus('💾 Guardando en la nube...');
            for (const [fecha, datos] of Object.entries(datosImportados)) {
              await saveToFirebase('historicalData', fecha, datos);
            }
            for (const [mes, resumen] of Object.entries(resumenesImportados)) {
              await saveToFirebase('monthlyData', mes, resumen);
            }
            setCloudStatus('✅ Datos guardados en la nube');
          } catch (firebaseError) {
            console.error('Error guardando en Firebase:', firebaseError);
            setCloudStatus('⚠️ Guardado local - Error en nube');
          }
        }

        setHistoricalData(datosImportados);
        setMonthlyData(resumenesImportados);

        // Re-consolidar meses a partir de los datos importados para evitar monthlyData "congelado"
        try {
          const mesesDeHistorico = Object.keys(datosImportados || {}).map(f => String(f).slice(0, 7));
          const mesesDeResumen = Object.keys(resumenesImportados || {});
          const mesesAReconsolidar = Array.from(new Set([...mesesDeHistorico, ...mesesDeResumen]))
            .filter(m => m && /^\d{4}-\d{2}$/.test(m))
            .sort();

          for (const mk of mesesAReconsolidar) {
            await consolidarMesRobusto(mk, datosImportados, resumenesImportados);
          }
        } catch (reconsolidarError) {
          console.warn('⚠️ No fue posible re-consolidar meses después de importar:', reconsolidarError);
        }

        if (datosImportados[currentDate]) {
          const datosHoy = datosImportados[currentDate];
          setTodayData(datosHoy);
          setIsDayCompleted(true);
          setCompletedSteps({ paso1: true, paso2: true });
          setCurrentView('resumen');
          alert(`✅ Backup importado exitosamente!\n\n📊 Se encontraron datos para hoy (${currentDate}).`);
        } else {
          const diasDelMesActual = Object.keys(datosImportados)
            .filter(date => date.startsWith(currentMonth) && date < currentDate)
            .sort((a, b) => b.localeCompare(a));

          if (diasDelMesActual.length > 0) {
            const ultimaFecha = diasDelMesActual[0];
            const ultimosDatos = datosImportados[ultimaFecha];
            setTodayData({
              date: currentDate,
              paso1: {
                dato1: '', dato2: '', total: 0,
                acumuladoAnterior: ultimosDatos.paso1?.acumulado || 0,
                acumulado: ultimosDatos.paso1?.acumulado || 0,
                totalDiaAnterior: ultimosDatos.paso1?.total || 0
              },
              paso2: {
                dato1: '', dato2: '', total: 0,
                acumuladoAnterior: ultimosDatos.paso2?.acumulado || 0,
                acumulado: ultimosDatos.paso2?.acumulado || 0,
                totalDiaAnterior: ultimosDatos.paso2?.total || 0
              },
              porcentaje: 0
            });
            alert(`✅ Backup importado exitosamente!\n\n📊 ${Object.keys(datosImportados).length} días importados.\n📅 Último día del mes actual: ${ultimaFecha}`);
          } else {
            setTodayData({
              date: currentDate,
              paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0, totalDiaAnterior: 0 },
              paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0, totalDiaAnterior: 0 },
              porcentaje: 0
            });
            alert(`✅ Backup importado exitosamente!\n\n💡 Puedes comenzar a registrar datos desde hoy.`);
          }

          setIsDayCompleted(false);
          setCompletedSteps({ paso1: false, paso2: false });
          setCurrentView('paso1');
        }

        setCloudStatus('✅ Backup importado - Listo');

        if (user) {
          setTimeout(async () => {
            try {
              await loadDataFromFirebase(user.uid);
              setCloudStatus('✅ Datos sincronizados');
            } catch (error) {
              console.error('Error recargando datos después de importar:', error);
            }
          }, 1000);
        }

      } catch (error) {
        console.error('Error importando JSON:', error);
        setCloudStatus('❌ Error al importar');
        alert(`❌ Error al importar el backup:\n\n${error.message}\n\n💡 Asegúrate de usar un archivo exportado desde esta aplicación.`);
      }
    };

    reader.readAsText(file);
  };

// ===================== EXPORTAR RESUMEN DIARIO (SOLO PORCENTAJES) =====================
const exportDailySummaryToExcel = () => {
  try {
    if (isLimitedUser) {
      alert('⛔ Tu usuario no tiene permisos para descargar reportes.');
      return;
    }
    if (!historicalData || Object.keys(historicalData).length === 0) {
      alert("No hay datos diarios para exportar.");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Calculadora Diaria';
    workbook.created = new Date();

    // Hoja 1: Resumen de Días
    const daysSheet = workbook.addWorksheet('Resumen Días');
    daysSheet.getColumn(1).width = 15;
    daysSheet.getColumn(2).width = 20;
    daysSheet.getColumn(3).width = 15;
    daysSheet.getColumn(4).width = 20;

    const daysTitleRow = daysSheet.addRow(['RESUMEN DIARIO - PORCENTAJES']);
    daysTitleRow.font = { bold: true, size: 14, color: { argb: '1F4E78' } };
    daysTitleRow.alignment = { horizontal: 'center' };
    daysSheet.mergeCells('A1:D1');

    const daysHeaders = daysSheet.addRow(['Fecha', 'Día de la Semana', '% del Día', '% Acumulado del Mes']);
    daysHeaders.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { horizontal: 'center' };
    });

    let acumuladoPorMes = {};
    const sortedDates = Object.keys(historicalData).sort();
    
    sortedDates.forEach(date => {
      const monthKey = date.slice(0, 7);
      if (!acumuladoPorMes[monthKey]) {
        acumuladoPorMes[monthKey] = { paso1: 0, paso2: 0 };
      }
      const data = historicalData[date];
      const totalP1 = parseFloat(data.paso1?.total) || 0;
      const totalP2 = parseFloat(data.paso2?.total) || 0;
      acumuladoPorMes[monthKey].paso1 += totalP1;
      acumuladoPorMes[monthKey].paso2 += totalP2;
    });

    sortedDates.forEach((date, index) => {
      const data = historicalData[date];
      const dateObj = new Date(date + 'T00:00:00');
      const dayOfWeek = dateObj.toLocaleDateString('es-CO', { weekday: 'long' });
      
      const totalP1Dia = parseFloat(data.paso1?.total) || 0;
      const totalP2Dia = parseFloat(data.paso2?.total) || 0;
      
      let porcentajeDia = 0;
      if (totalP1Dia > 0 && totalP2Dia > 0) {
        const menor = Math.min(totalP1Dia, totalP2Dia);
        const mayor = Math.max(totalP1Dia, totalP2Dia);
        porcentajeDia = (menor / mayor) * 100;
      }
      
      const monthKey = date.slice(0, 7);
      const acumP1 = acumuladoPorMes[monthKey]?.paso1 || 0;
      const acumP2 = acumuladoPorMes[monthKey]?.paso2 || 0;
      let porcentajeAcumulado = 0;
      if (acumP1 > 0 && acumP2 > 0) {
        const menor = Math.min(acumP1, acumP2);
        const mayor = Math.max(acumP1, acumP2);
        porcentajeAcumulado = (menor / mayor) * 100;
      }
      
      const row = daysSheet.addRow([
        date,
        dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1),
        porcentajeDia / 100,
        porcentajeAcumulado / 100
      ]);
      
      if (index % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E6F0FF' } };
        });
      }
      row.eachCell((cell) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      row.getCell(3).numFmt = '0.00%';
      row.getCell(4).numFmt = '0.00%';
    });

    // Hoja 2: Resumen de Meses (solo meses visibles)
    const mesesVisibles = Object.keys(monthlyData).filter(month => monthlyData[month]?.estado !== 1);
    if (mesesVisibles.length > 0) {
      const monthsSheet = workbook.addWorksheet('Resumen Meses');
      monthsSheet.getColumn(1).width = 15;
      monthsSheet.getColumn(2).width = 15;

      const monthsTitleRow = monthsSheet.addRow(['RESUMEN MENSUAL - PORCENTAJES']);
      monthsTitleRow.font = { bold: true, size: 14, color: { argb: '1F4E78' } };
      monthsTitleRow.alignment = { horizontal: 'center' };
      monthsSheet.mergeCells('A1:B1');

      const monthsHeaders = monthsSheet.addRow(['Mes', 'Porcentaje Final']);
      monthsHeaders.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E75B6' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: 'center' };
      });

      mesesVisibles.sort().forEach((month, index) => {
        const data = monthlyData[month];
        const porcentaje = data.porcentajeFinal || 0;
        
        const row = monthsSheet.addRow([month, porcentaje / 100]);
        if (index % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F2F2F2' } };
          });
        }
        row.eachCell((cell) => {
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
        row.getCell(2).numFmt = '0.00%';
      });
    }

    workbook.xlsx.writeBuffer().then(buffer => {
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `resumen_porcentajes_${currentDate}.xlsx`;
      saveAs(blob, fileName);
      alert(`✅ Resumen de porcentajes exportado exitosamente.\n\nArchivo: ${fileName}`);
    });

  } catch (error) {
    console.error('Error exportando resumen diario:', error);
    alert('❌ Error al exportar el resumen de porcentajes.');
  }
};

  // ===================== LIMPIAR DATOS VISUALMENTE =====================
  const abrirModalLimpiar = () => {
    if (isLimitedUser) {
      alert('⛔ Tu usuario no tiene permisos para eliminar/limpiar datos.');
      return;
    }
    setShowCleanModal(true);
    setSelectedMonthToClean('');
  };

  const confirmarLimpiarMes = async () => {
    if (!selectedMonthToClean) {
      alert('Selecciona un mes');
      return;
    }
    
    let mesesALimpiar = [];
    if (selectedMonthToClean === 'TODOS') {
      mesesALimpiar = Object.keys(monthlyData).filter(m => m !== currentMonth);
    } else {
      mesesALimpiar = [selectedMonthToClean];
    }
    
    if (mesesALimpiar.length === 0) {
      alert('No hay meses para limpiar');
      return;
    }
    
    const confirmMsg = `⚠️ ¿Seguro que deseas limpiar ${mesesALimpiar.length} mes(es)?\n\n${mesesALimpiar.join(', ')}\n\nLos datos se borrarán de la interfaz.`;
    
    if (window.confirm(confirmMsg)) {
      for (const mes of mesesALimpiar) {
        if (user) {
          const monthlyRef = doc(db, 'users', user.uid, 'monthlyData', mes);
          await setDoc(monthlyRef, { estado: 1 }, { merge: true });
        }
        
        setMonthlyData(prev => ({
          ...prev,
          [mes]: { ...prev[mes], estado: 1 }
        }));
      }
      
      setShowCleanModal(false);
      setSelectedMonthToClean('');
      alert(`✅ ${mesesALimpiar.length} mes(es) limpios.`);
    }
  };

  // ===================== FUNCIÓN PARA EXPORTAR A EXCEL =====================
  const exportToExcel = (type = 'full') => {
    try {
      if (isLimitedUser) {
        alert('⛔ Tu usuario no tiene permisos para descargar reportes.');
        return;
      }
      if (type === 'monthly' && (!monthlyData || Object.keys(monthlyData).length === 0)) {
        alert("No hay datos mensuales para exportar.");
        return;
      }

      if (type !== 'monthly' && (!historicalData || Object.keys(historicalData).length === 0)) {
        alert("No hay datos diarios para exportar.");
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Calculadora Diaria App';
      workbook.created = new Date();

      const dayDataForExport = isDayCompleted && historicalData[currentDate]
        ? historicalData[currentDate]
        : todayData;

      if (type === 'full' || type === 'today') {
        const todaySheet = workbook.addWorksheet('Día Actual');
        todaySheet.getColumn(1).width = 25;
        todaySheet.getColumn(2).width = 25;

        const todayTitleRow = todaySheet.addRow(['REPORTE DEL DÍA ACTUAL']);
        todayTitleRow.font = { bold: true, size: 16, color: { argb: '1F4E78' } };
        todayTitleRow.alignment = { horizontal: 'center' };
        todaySheet.mergeCells('A1:B1');

        todaySheet.addRow(['Fecha:', currentDate]);
        todaySheet.addRow(['Mes actual:', currentMonth]);
        todaySheet.addRow(['Estado:', isDayCompleted ? '✅ Día completado' : '⏳ Día en progreso']);
        todaySheet.addRow([]);

        const paso1Header = todaySheet.addRow(['PASO 1', '']);
        paso1Header.font = { bold: true, color: { argb: 'FFFFFF' } };
        paso1Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E75B6' } };
        todaySheet.mergeCells('A6:B6');

        todaySheet.addRow(['Dato 1:', parseFloat(dayDataForExport.paso1.dato1 || 0)]);
        todaySheet.addRow(['Dato 2:', parseFloat(dayDataForExport.paso1.dato2 || 0)]);
        todaySheet.addRow(['Total del día:', dayDataForExport.paso1.total || 0]);
        todaySheet.addRow(['Acumulado anterior:', dayDataForExport.paso1.acumuladoAnterior || 0]);
        todaySheet.addRow(['Acumulado del mes:', dayDataForExport.paso1.acumulado || 0]);
        todaySheet.addRow([]);

        const paso2Header = todaySheet.addRow(['PASO 2', '']);
        paso2Header.font = { bold: true, color: { argb: 'FFFFFF' } };
        paso2Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '70AD47' } };
        todaySheet.mergeCells('A13:B13');

        todaySheet.addRow(['Dato 1:', parseFloat(dayDataForExport.paso2.dato1 || 0)]);
        todaySheet.addRow(['Dato 2:', parseFloat(dayDataForExport.paso2.dato2 || 0)]);
        todaySheet.addRow(['Total del día:', dayDataForExport.paso2.total || 0]);
        todaySheet.addRow(['Acumulado anterior:', dayDataForExport.paso2.acumuladoAnterior || 0]);
        todaySheet.addRow(['Acumulado del mes:', dayDataForExport.paso2.acumulado || 0]);
        todaySheet.addRow([]);

        const resumenHeader = todaySheet.addRow(['RESUMEN GENERAL', '']);
        resumenHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
        resumenHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7030A0' } };
        todaySheet.mergeCells('A20:B20');

        const totalPaso1 = dayDataForExport.paso1.total || 0;
        const totalPaso2 = dayDataForExport.paso2.total || 0;
        const totalDia = totalPaso1 + totalPaso2;
        const totalAcumulado = (dayDataForExport.paso1.acumulado || 0) + (dayDataForExport.paso2.acumulado || 0);

        let porcentajeDia = 0;
        if (totalPaso1 > 0 && totalPaso2 > 0) {
          const menor = Math.min(totalPaso1, totalPaso2);
          const mayor = Math.max(totalPaso1, totalPaso2);
          porcentajeDia = (menor / mayor) * 100;
        }

        todaySheet.addRow(['Total del día (P1 + P2):', totalDia]);
        todaySheet.addRow(['Total acumulado (P1 + P2):', totalAcumulado]);
        todaySheet.addRow(['Porcentaje del día:', porcentajeDia / 100]);

        for (let i = 7; i <= 22; i++) {
          if (i !== 6 && i !== 13 && i !== 20) {
            const cell = todaySheet.getCell(`B${i}`);
            if (i !== 22) cell.numFmt = '#,##0';
          }
        }
        const porcentajeCell = todaySheet.getCell('B22');
        porcentajeCell.numFmt = '0.00%';
      }

      if (type === 'full' || type === 'daily') {
        const dailySheet = workbook.addWorksheet('Detalle Diario');
        [1,2,3,4,5,6,7,8,9,10,11,12].forEach((col, i) => {
          dailySheet.getColumn(col).width = [15,20,15,15,15,20,15,15,15,20,15,20][i];
        });

        const isFullExport = type === 'full';
        const dailyTitleRow = dailySheet.addRow([isFullExport ? 'DETALLE DIARIO - TODOS LOS MESES' : 'DETALLE DIARIO - MES ACTUAL']);
        dailyTitleRow.font = { bold: true, size: 14, color: { argb: '1F4E78' } };
        dailyTitleRow.alignment = { horizontal: 'center' };
        dailySheet.mergeCells('A1:L1');

        dailySheet.addRow(['Mes:', currentMonth]);
        dailySheet.addRow([]);

        const dailyHeaders = dailySheet.addRow([
          'Fecha', 'Día de la Semana',
          'P1 - Dato 1', 'P1 - Dato 2', 'P1 - Total Día', 'P1 - Acumulado',
          'P2 - Dato 1', 'P2 - Dato 2', 'P2 - Total Día', 'P2 - Acumulado',
          'Porcentaje Día', 'Total del Día'
        ]);
        dailyHeaders.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: 'FFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { horizontal: 'center' };
        });

        // Días a exportar
        const sortedDates = Object.keys(historicalData)
          .filter(date => {
            if (!isFullExport) return date.startsWith(currentMonth);
            const monthKey = date.slice(0, 7);
            return monthlyData?.[monthKey]?.estado !== 1;
          })
          .sort();

        if (sortedDates.length === 0) {
          dailySheet.addRow([isFullExport ? 'No hay datos registrados (todos los meses)' : 'No hay datos registrados en el mes actual', '', '', '', '', '', '', '', '', '', '', '']);
        } else {
          sortedDates.forEach((date, index) => {
            const data = historicalData[date];
            const dateObj = new Date(date + 'T00:00:00');
            const dayOfWeek = dateObj.toLocaleDateString('es-CO', { weekday: 'long' });

            const acumuladoPaso1 = Math.max(0, parseFloat(data.paso1?.acumulado) || 0);
            const acumuladoPaso2 = Math.max(0, parseFloat(data.paso2?.acumulado) || 0);

            let porcentajeDia = 0;
            const totalPaso1Dia = Math.max(0, parseFloat(data.paso1?.total) || 0);
            const totalPaso2Dia = Math.max(0, parseFloat(data.paso2?.total) || 0);
            if (totalPaso1Dia > 0 && totalPaso2Dia > 0) {
              const menor = Math.min(totalPaso1Dia, totalPaso2Dia);
              const mayor = Math.max(totalPaso1Dia, totalPaso2Dia);
              porcentajeDia = (menor / mayor) * 100;
            }

            const row = dailySheet.addRow([
              date,
              dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1),
              Math.max(0, parseFloat(data.paso1?.dato1 || 0)),
              Math.max(0, parseFloat(data.paso1?.dato2 || 0)),
              totalPaso1Dia,
              acumuladoPaso1,
              Math.max(0, parseFloat(data.paso2?.dato1 || 0)),
              Math.max(0, parseFloat(data.paso2?.dato2 || 0)),
              totalPaso2Dia,
              acumuladoPaso2,
              Math.min(100, Math.max(0, porcentajeDia / 100)),
              totalPaso1Dia + totalPaso2Dia
            ]);

            if (index % 2 === 0) {
              row.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E6F0FF' } };
              });
            }
            row.eachCell((cell) => {
              cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
            row.getCell(11).numFmt = '0.00%';
            [3, 4, 5, 6, 7, 8, 9, 10, 12].forEach(colIndex => {
              row.getCell(colIndex).numFmt = '#,##0';
            });
          });
        }
      }

      if (type === 'full' || type === 'monthly') {
        // Filtrar meses visibles (estado !== 1)
        const monthsVisibles = Object.keys(monthlyData)
          .filter(month => monthlyData[month]?.estado !== 1)
          .sort();
        
        if (monthsVisibles.length > 0) {
          const monthlySheet = workbook.addWorksheet('Resumen por Mes');
          monthlySheet.getColumn(1).width = 15;
          monthlySheet.getColumn(2).width = 15;

          const monthlyTitleRow = monthlySheet.addRow(['RESUMEN POR MES']);
          monthlyTitleRow.font = { bold: true, size: 14, color: { argb: '1F4E78' } };
          monthlyTitleRow.alignment = { horizontal: 'center' };
          monthlySheet.mergeCells('A1:B1');

          const monthlyHeaders = monthlySheet.addRow(['Mes', 'Porcentaje Final']);
          monthlyHeaders.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E75B6' } };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            cell.alignment = { horizontal: 'center' };
          });

          monthsVisibles.forEach((month, index) => {
            const data = monthlyData[month];
            const porcentajeMes = data.porcentajeFinal || 0;
            
            const row = monthlySheet.addRow([month, porcentajeMes / 100]);
            if (index % 2 === 0) {
              row.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F2F2F2' } };
              });
            }
            row.eachCell((cell) => {
              cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
            row.getCell(2).numFmt = '0.00%';
          });
        } else if (type === 'monthly') {
          alert("No hay datos mensuales visibles para exportar.");
          return;
        }
      }

      workbook.xlsx.writeBuffer()
        .then(buffer => {
          try {
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            let fileName = `calculadora_diaria_${type}_${currentDate}.xlsx`;
            saveAs(blob, fileName);
            console.log(`✅ Archivo ${fileName} exportado exitosamente`);
            alert(`✅ Reporte exportado exitosamente.\n\nArchivo: ${fileName}`);
          } catch (blobError) {
            console.error('Error al crear blob o guardar archivo:', blobError);
            alert(`❌ Error al guardar el archivo: ${blobError.message}`);
          }
        })
        .catch(writeError => {
          console.error('Error al generar Excel:', writeError);
          alert(`❌ Error al generar el archivo Excel: ${writeError.message}`);
        });

    } catch (error) {
      console.error('Error al exportar a Excel:', error);
      alert(`❌ Error al exportar: ${error.message}`);
    }
  };

  // ===================== EXPORTAR MES ESPECÍFICO A EXCEL =====================
  const exportMonthToExcel = (monthKey) => {
    try {
      if (isLimitedUser) {
        alert('⛔ Tu usuario no tiene permisos para descargar reportes.');
        return;
      }
      const monthData = monthlyData[monthKey];

      if (!monthData) {
        alert(`ℹ️ No hay datos consolidados para el mes ${monthKey}.`);
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Calculadora Diaria App';
      workbook.created = new Date();

      const summarySheet = workbook.addWorksheet('Resumen del Mes');
      summarySheet.getColumn(1).width = 25;
      summarySheet.getColumn(2).width = 25;

      const titleRow = summarySheet.addRow([`REPORTE DEL MES ${monthKey}`]);
      titleRow.font = { bold: true, size: 16, color: { argb: '1F4E78' } };
      titleRow.alignment = { horizontal: 'center' };
      summarySheet.mergeCells('A1:B1');

      summarySheet.addRow(['Mes:', monthKey]);
      summarySheet.addRow(['Días registrados:', monthData.informacionConsolidada?.diasTotales || 0]);
      summarySheet.addRow(['Primer día:', monthData.informacionConsolidada?.primerDia || 'N/A']);
      summarySheet.addRow(['Último día:', monthData.informacionConsolidada?.ultimoDia || 'N/A']);
      summarySheet.addRow(['Fecha de consolidación:',
        monthData.fechaConsolidacion
          ? new Date(monthData.fechaConsolidacion).toLocaleDateString('es-CO')
          : 'N/A'
      ]);
      summarySheet.addRow([]);

      const totalesHeader = summarySheet.addRow(['TOTALES POR DÍA', '']);
      totalesHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
      totalesHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E75B6' } };
      summarySheet.mergeCells('A8:B8');

      const totalPaso1 = monthData.totalesPorDia?.paso1 || monthData.acumuladoGeneral?.paso1 || 0;
      const totalPaso2 = monthData.totalesPorDia?.paso2 || monthData.acumuladoGeneral?.paso2 || 0;
      const totalGeneral = monthData.totalesPorDia?.general || (totalPaso1 + totalPaso2);

      summarySheet.addRow(['Total Paso 1:', totalPaso1]);
      summarySheet.addRow(['Total Paso 2:', totalPaso2]);
      summarySheet.addRow(['Total General:', totalGeneral]);
      summarySheet.addRow([]);

      const acumuladosHeader = summarySheet.addRow(['ACUMULADOS FINALES', '']);
      acumuladosHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
      acumuladosHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '70AD47' } };
      summarySheet.mergeCells('A13:B13');

      const acumuladoPaso1 = monthData.acumuladoGeneral?.paso1 || totalPaso1;
      const acumuladoPaso2 = monthData.acumuladoGeneral?.paso2 || totalPaso2;
      const acumuladoTotal = monthData.acumuladoGeneral?.total || (acumuladoPaso1 + acumuladoPaso2);
      const porcentajeFinal = monthData.porcentajeFinal || 0;

      summarySheet.addRow(['Acumulado Paso 1:', acumuladoPaso1]);
      summarySheet.addRow(['Acumulado Paso 2:', acumuladoPaso2]);
      summarySheet.addRow(['Acumulado Total:', acumuladoTotal]);
      summarySheet.addRow(['Porcentaje final:', porcentajeFinal / 100]);

      [9, 10, 11, 14, 15, 16].forEach(row => { summarySheet.getCell(`B${row}`).numFmt = '#,##0'; });
      summarySheet.getCell('B17').numFmt = '0.00%';

      workbook.xlsx.writeBuffer().then(buffer => {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const fileName = `mes_${monthKey}_reporte.xlsx`;
        saveAs(blob, fileName);
        alert(`✅ Mes ${monthKey} exportado a Excel exitosamente.\n\nArchivo: ${fileName}`);
      });

    } catch (error) {
      console.error('Error al exportar mes a Excel:', error);
      alert('❌ Error al exportar el mes a Excel.');
    }
  };

  // ===================== DETECCIÓN DE CAMBIO DE MES =====================
  useEffect(() => {
    const checkMonthAndLastDay = () => {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const isLastDay = today.getDate() === lastDayOfMonth;
      setIsLastDayOfMonth(isLastDay);

      const newMonth = `${year}-${String(month).padStart(2, '0')}`;

      if (newMonth !== currentMonth) {
        console.log(`🔄 ¡Cambió el mes! De ${currentMonth} a ${newMonth}`);

        const diasDelMesAnterior = Object.keys(historicalData).filter(date => date.startsWith(currentMonth));
        if (diasDelMesAnterior.length > 0) {
          saveMonthSummary(currentMonth);
        }

        setCurrentMonth(newMonth);
        setTodayData({
          date: new Date().toISOString().split('T')[0],
          paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0, totalDiaAnterior: 0 },
          paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0, totalDiaAnterior: 0 },
          porcentaje: 0
        });

        setIsDayCompleted(false);
        setCompletedSteps({ paso1: false, paso2: false });
        setCurrentView('paso1');

        alert(`📅 ¡Nuevo mes comenzado! (${newMonth})\n\n` +
          `✅ El mes anterior (${currentMonth}) se guardó en el historial.\n` +
          `📊 Los acumulados comienzan desde CERO.\n` +
          `💡 Puedes ver meses anteriores en el historial.`);
      }
    };

    checkMonthAndLastDay();
    const interval = setInterval(checkMonthAndLastDay, 60000);
    return () => clearInterval(interval);
  }, [currentDate, currentMonth, historicalData]);

  // Efecto para actualizar todayData cuando se carga historicalData
  useEffect(() => {
    if (!loading && historicalData[currentDate]) {
      console.log('🔄 Actualizando todayData con datos del día actual desde historicalData');
      const dayData = historicalData[currentDate];
      setTodayData({
        date: currentDate,
        paso1: {
          dato1: dayData.paso1?.dato1 || '',
          dato2: dayData.paso1?.dato2 || '',
          total: dayData.paso1?.total || 0,
          acumuladoAnterior: dayData.paso1?.acumuladoAnterior || 0,
          acumulado: dayData.paso1?.acumulado || 0,
          totalDiaAnterior: dayData.paso1?.totalDiaAnterior || 0
        },
        paso2: {
          dato1: dayData.paso2?.dato1 || '',
          dato2: dayData.paso2?.dato2 || '',
          total: dayData.paso2?.total || 0,
          acumuladoAnterior: dayData.paso2?.acumuladoAnterior || 0,
          acumulado: dayData.paso2?.acumulado || 0,
          totalDiaAnterior: dayData.paso2?.totalDiaAnterior || 0
        },
        porcentaje: dayData.porcentaje || 0
      });
      setIsDayCompleted(true);
      setCompletedSteps({ paso1: true, paso2: true });
      setCurrentView('resumen');
    }
  }, [historicalData, currentDate, loading]);

  // Función para verificar si el día actual ya fue guardado
  const checkIfTodayIsCompleted = async () => {
    try {
      console.log('🔄 Verificando si el día actual está completado...', currentDate);

      if (historicalData && historicalData[currentDate]) {
        console.log('✅ Día actual encontrado en historicalData en memoria');
        const data = historicalData[currentDate];
        setTodayData({
          date: currentDate,
          paso1: {
            dato1: data.paso1?.dato1 || '',
            dato2: data.paso1?.dato2 || '',
            total: data.paso1?.total || 0,
            acumuladoAnterior: data.paso1?.acumuladoAnterior || 0,
            acumulado: data.paso1?.acumulado || 0,
            totalDiaAnterior: data.paso1?.totalDiaAnterior || 0
          },
          paso2: {
            dato1: data.paso2?.dato1 || '',
            dato2: data.paso2?.dato2 || '',
            total: data.paso2?.total || 0,
            acumuladoAnterior: data.paso2?.acumuladoAnterior || 0,
            acumulado: data.paso2?.acumulado || 0,
            totalDiaAnterior: data.paso2?.totalDiaAnterior || 0
          },
          porcentaje: data.porcentaje || 0
        });
        setIsDayCompleted(true);
        setCompletedSteps({ paso1: true, paso2: true });
        setCurrentView('resumen');
        return true;
      }

      if (user) {
        try {
          const docRef = doc(db, 'users', user.uid, 'historicalData', currentDate);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            console.log('✅ Día actual encontrado en Firebase');
            const data = docSnap.data();
            setHistoricalData(prev => ({ ...prev, [currentDate]: data }));
            setTodayData({
              date: currentDate,
              paso1: {
                dato1: data.paso1?.dato1 || '',
                dato2: data.paso1?.dato2 || '',
                total: data.paso1?.total || 0,
                acumuladoAnterior: data.paso1?.acumuladoAnterior || 0,
                acumulado: data.paso1?.acumulado || 0,
                totalDiaAnterior: data.paso1?.totalDiaAnterior || 0
              },
              paso2: {
                dato1: data.paso2?.dato1 || '',
                dato2: data.paso2?.dato2 || '',
                total: data.paso2?.total || 0,
                acumuladoAnterior: data.paso2?.acumuladoAnterior || 0,
                acumulado: data.paso2?.acumulado || 0,
                totalDiaAnterior: data.paso2?.totalDiaAnterior || 0
              },
              porcentaje: data.porcentaje || 0
            });
            setIsDayCompleted(true);
            setCompletedSteps({ paso1: true, paso2: true });
            setCurrentView('resumen');
            return true;
          }
        } catch (firebaseError) {
          console.log('ℹ️ Error al conectar con Firebase para verificar día actual');
        }
      }

      console.log('ℹ️ Día actual NO encontrado - listo para registrar');
      setIsDayCompleted(false);
      loadPreviousDayData();
      return false;
    } catch (error) {
      console.error('Error verificando día actual:', error);
      setIsDayCompleted(false);
      loadPreviousDayData();
      return false;
    }
  };

  // Cargar datos iniciales CON FIREBASE
  useEffect(() => {
    if (!isSessionAuthenticated) {
      setLoading(false);
      return;
    }

    const loadInitialData = async () => {
      try {
        setLoading(true);
        const FIXED_USER_ID = 'bEY1p1kgVjgk88AlCGa7nM6I1de2';

        try {
          const fixedUser = { uid: FIXED_USER_ID };
          setUser(fixedUser);
          await loadDataFromFirebase(FIXED_USER_ID);
          setCloudStatus('✅ Conectado a la nube');
        } catch (firebaseError) {
          console.log('Firebase no disponible, usando modo local');
          setCloudStatus('⚠️ Usando modo local');
          setHistoricalData({});
          setMonthlyData({});
        }

        setTimeout(async () => {
          await checkIfTodayIsCompleted();
          
          console.log('🔍 Verificando si March (2026-03) necesita corrección...');
          const marzoData = Object.keys(historicalData || {}).filter(date => date.startsWith('2026-03'));
          if (marzoData.length > 0) {
            const dia31 = historicalData['2026-03-31'];
            if (dia31 && parseFloat(dia31.paso1?.acumulado) === parseFloat(dia31.paso1?.total)) {
              console.warn('❌ Marzo 31 está MAL - acumulado = total (sin acumulado anterior)');
              console.log('🔧 Iniciando corrección automática...');
              await corregirDatosDelMes('2026-03');
              alert('✅ Marzo ha sido corregido automáticamente');
            }
          }
          
          setLoading(false);
        }, 500);

      } catch (err) {
        setError('Error al cargar los datos');
        console.error('Error loading data:', err);
        setLoading(false);
      }
    };

    loadInitialData();
  }, [currentDate, isSessionAuthenticated]);

  // Efecto para cargar día anterior después de verificar el día actual
  useEffect(() => {
    if (!loading && !isDayCompleted && Object.keys(historicalData).length > 0) {
      console.log('📊 Cargando acumulados desde datos históricos');
      loadPreviousDayData();
    }
  }, [loading, isDayCompleted, historicalData]);

  // Función para cargar datos desde Firebase
  const loadDataFromFirebase = async (userId) => {
    try {
      const historicalRef = collection(db, 'users', userId, 'historicalData');
      const historicalSnapshot = await getDocs(historicalRef);
      const historical = {};
      historicalSnapshot.forEach(doc => { 
        const data = doc.data();
        if (data && data.paso1 && data.paso2) {
          historical[doc.id] = data;
        }
      });

      const monthlyRef = collection(db, 'users', userId, 'monthlyData');
      const monthlySnapshot = await getDocs(monthlyRef);
      const monthly = {};
      monthlySnapshot.forEach(doc => { 
        const data = doc.data();
        if (data && data.acumuladoGeneral) {
          // Asegurar que el campo estado exista (por defecto 0 = visible)
          if (data.estado === undefined) {
            data.estado = 0;
          }
          monthly[doc.id] = data;
        }
      });

      setHistoricalData(historical);
      setMonthlyData(monthly);

      console.log('✅ Datos cargados desde Firebase:', {
        diasHistoricos: Object.keys(historical).length,
        mesesConsolidados: Object.keys(monthly).length,
        meses: Object.keys(monthly)
      });
    } catch (error) {
      console.error('Error cargando de Firebase:', error);
      throw error;
    }
  };

  // Función para guardar en Firebase
  const saveToFirebase = async (collectionName, documentId, data) => {
    if (!user) {
      console.log(`⚠️ Usuario no autenticado - No se puede guardar en Firebase: ${collectionName}/${documentId}`);
      return false;
    }
    try {
      const docRef = doc(db, 'users', user.uid, collectionName, documentId);
      await setDoc(docRef, data, { merge: true });
      console.log(`✅ Guardado en Firebase: ${collectionName}/${documentId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error guardando en Firebase (${collectionName}/${documentId}):`, error);
      if (error.code === 'permission-denied') {
        alert(`⚠️ Error de permisos en Firebase.\n\nNo se pudo guardar: ${collectionName}/${documentId}\n\nLos datos se guardarán localmente.`);
      } else if (error.code === 'unavailable' || error.message?.includes('offline')) {
        console.warn(`⚠️ Firebase no disponible, guardando localmente`);
        setCloudStatus('⚠️ Sin conexión - guardando localmente');
      }
      return false;
    }
  };

  // Función para eliminar de Firebase
  const deleteFromFirebase = async (collectionName, documentId) => {
    if (!user) return false;
    try {
      const docRef = doc(db, 'users', user.uid, collectionName, documentId);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error eliminando de Firebase:', error);
      return false;
    }
  };

  // ===================== GUARDAR RESUMEN DEL MES =====================
  const saveMonthSummary = async (monthKey, historicalSnapshot = null) => {
    console.log(`📊 saveMonthSummary llamado para: ${monthKey}`);
    return await consolidarMesRobusto(monthKey, historicalSnapshot, null);
  };

  // ✅ NUEVO: Botón manual para consolidar el mes actual o un mes pasado
  const consolidarMesManual = async (monthKey) => {
    const confirmMsg = `¿Consolidar el mes ${monthKey}?\n\nEsto generará o actualizará el resumen del mes.`;
    if (!window.confirm(confirmMsg)) return;
    
    setCloudStatus(`⏳ Consolidando mes ${monthKey}...`);
    const resultado = await saveMonthSummary(monthKey);
    if (resultado) {
      setCloudStatus(`✅ Mes ${monthKey} consolidado exitosamente`);
      alert(`📅 ¡Mes ${monthKey} consolidado correctamente!`);
    } else {
      setCloudStatus(`❌ Error consolidando mes ${monthKey}`);
      alert(`❌ Error al consolidar el mes ${monthKey}`);
    }
  };

  // ✅ FUNCIÓN ROBUSTA: Consolidar y guardar mes sin depender del estado
  const consolidarMesRobusto = async (monthKey, historicalSnapshot = null, monthlySnapshot = null) => {
    console.log(`🔨 Consolidando mes ${monthKey} de forma robusta...`);
    try {
      const historico = historicalSnapshot || historicalData;
      const mensual = monthlySnapshot || monthlyData;

      const diasDelMes = Object.entries(historico)
        .filter(([date]) => date.startsWith(monthKey))
        .sort((a, b) => a[0].localeCompare(b[0]));

      if (diasDelMes.length === 0) {
        console.warn(`⚠️ No hay días registrados para ${monthKey}`);
        alert(`❌ No hay datos histó para consolidar el mes ${monthKey}`);
        return false;
      }

      console.log(`📊 Encontrados ${diasDelMes.length} días para ${monthKey}`);

      let totalDiarioPaso1 = 0;
      let totalDiarioPaso2 = 0;
      const diasRegistrados = [];

      diasDelMes.forEach(([date, data]) => {
        const totalP1 = Math.max(0, parseFloat(data.paso1?.total) || 0);
        const totalP2 = Math.max(0, parseFloat(data.paso2?.total) || 0);
        totalDiarioPaso1 += totalP1;
        totalDiarioPaso2 += totalP2;

        diasRegistrados.push({
          fecha: date,
          paso1: {
            totalDia: totalP1,
            acumuladoHastaDia: totalDiarioPaso1
          },
          paso2: {
            totalDia: totalP2,
            acumuladoHastaDia: totalDiarioPaso2
          },
          porcentajeDia: data.porcentaje || 0
        });
      });

      const acumuladoFinalPaso1 = totalDiarioPaso1;
      const acumuladoFinalPaso2 = totalDiarioPaso2;
      const totalGeneralAcumulado = acumuladoFinalPaso1 + acumuladoFinalPaso2;
      const porcentajeFinal = acumuladoFinalPaso1 > 0 && acumuladoFinalPaso2 > 0
        ? (Math.min(acumuladoFinalPaso1, acumuladoFinalPaso2) / Math.max(acumuladoFinalPaso1, acumuladoFinalPaso2)) * 100
        : 0;

      const summary = {
        mes: monthKey,
        diasRegistrados,
        totalesPorDia: {
          paso1: Math.round(totalDiarioPaso1),
          paso2: Math.round(totalDiarioPaso2),
          general: Math.round(totalDiarioPaso1 + totalDiarioPaso2)
        },
        acumuladoGeneral: {
          paso1: Math.round(acumuladoFinalPaso1),
          paso2: Math.round(acumuladoFinalPaso2),
          total: Math.round(totalGeneralAcumulado)
        },
        porcentajeFinal: parseFloat(porcentajeFinal.toFixed(2)),
        fechaConsolidacion: new Date().toISOString(),
        informacionConsolidada: {
          diasTotales: diasDelMes.length,
          primerDia: diasDelMes[0][0],
          ultimoDia: diasDelMes[diasDelMes.length - 1][0]
        },
        estado: mensual?.[monthKey]?.estado ?? 0
      };

      console.log(`✅ Resumen construido para ${monthKey}:`, summary);

      setMonthlyData(prev => {
        const nuevo = { ...prev, [monthKey]: summary };
        console.log(`🔄 monthlyData actualizado localmente. Total meses: ${Object.keys(nuevo).length}`);
        return nuevo;
      });

      if (user) {
        const guardoExitoso = await saveToFirebase('monthlyData', monthKey, summary);
        if (guardoExitoso) {
          console.log(`✅ Mes ${monthKey} guardado en Firebase - ¡LISTO!`);
          setCloudStatus(`✅ Mes ${monthKey} consolidado en la nube`);
          return true;
        } else {
          console.warn(`⚠️ No se guardó en Firebase pero está localmente`);
          return true;
        }
      } else {
        console.log(`ℹ️ Usuario no autenticado, pero está guardado localmente`);
        return true;
      }

    } catch (error) {
      console.error(`❌ Error en consolidarMesRobusto para ${monthKey}:`, error);
      return false;
    }
  };

  // ✅ CORRECCIÓN DE EMERGENCIA: Arreglar datos malos que ya están en Firebase
  const corregirDatosDelMes = async (monthKey) => {
    console.log(`🔧 CORRIGIENDO datos del mes ${monthKey}...`);
    const diasDelMes = Object.entries(historicalData)
      .filter(([date]) => date.startsWith(monthKey))
      .sort((a, b) => a[0].localeCompare(b[0]));

    if (diasDelMes.length === 0) {
      console.warn(`No hay datos para corregir en ${monthKey}`);
      return false;
    }

    let datosCorregidos = {};
    let huboCorreccion = false;

    for (let i = 0; i < diasDelMes.length; i++) {
      const [fecha, datos] = diasDelMes[i];
      let datoCorrecto = { ...datos };

      if (!datoCorrecto.paso1) datoCorrecto.paso1 = {};
      if (!datoCorrecto.paso2) datoCorrecto.paso2 = {};

      const totalDiaPaso1 = parseFloat(datoCorrecto.paso1.dato1 || 0) + parseFloat(datoCorrecto.paso1.dato2 || 0);
      const totalDiaPaso2 = parseFloat(datoCorrecto.paso2.dato1 || 0) + parseFloat(datoCorrecto.paso2.dato2 || 0);
      datoCorrecto.paso1.total = totalDiaPaso1;
      datoCorrecto.paso2.total = totalDiaPaso2;

      if (i === 0) {
        datoCorrecto.paso1.acumuladoAnterior = 0;
        datoCorrecto.paso1.acumulado = totalDiaPaso1;
        datoCorrecto.paso2.acumuladoAnterior = 0;
        datoCorrecto.paso2.acumulado = totalDiaPaso2;
      } else {
        const datosAnterior = datosCorregidos[diasDelMes[i-1][0]];
        const acumAntP1 = parseFloat(datosAnterior.paso1?.acumulado) || 0;
        const acumAntP2 = parseFloat(datosAnterior.paso2?.acumulado) || 0;
        
        datoCorrecto.paso1.acumuladoAnterior = acumAntP1;
        datoCorrecto.paso1.acumulado = acumAntP1 + totalDiaPaso1;
        datoCorrecto.paso2.acumuladoAnterior = acumAntP2;
        datoCorrecto.paso2.acumulado = acumAntP2 + totalDiaPaso2;
      }

      if (
        datoCorrecto.paso1.acumulado !== datos.paso1?.acumulado ||
        datoCorrecto.paso2.acumulado !== datos.paso2?.acumulado
      ) {
        huboCorreccion = true;
        console.log(`✏️ ${fecha}: P1 acum ${datos.paso1?.acumulado} → ${datoCorrecto.paso1.acumulado}`);
      }

      datosCorregidos[fecha] = datoCorrecto;
    }

    if (!huboCorreccion) {
      console.log(`✅ ${monthKey} ya está correcto, sin cambios necesarios.`);
      return false;
    }

    console.log(`💾 Guardando ${Object.keys(datosCorregidos).length} días corregidos...`);
    for (const [fecha, datos] of Object.entries(datosCorregidos)) {
      await saveToFirebase('historicalData', fecha, datos);
    }

    setHistoricalData(prev => ({ ...prev, ...datosCorregidos }));
    setCloudStatus(`✅ Mes ${monthKey} corregido`);

    console.log(`🔄 Re-consolidando ${monthKey} con los datos corregidos...`);
    await consolidarMesRobusto(monthKey);

    console.log(`✅ ${monthKey} CORREGIDO y RECONSOLIDADO completamente`);
    return true;
  };

  // ✅ CONSOLIDAR TODOS - Mejorado
  const consolidarTodosLosMeses = async () => {
    const mesesSinResumen = Object.keys(historicalData)
      .map(date => date.slice(0, 7))
      .filter((mes, idx, self) => self.indexOf(mes) === idx && !monthlyData[mes])
      .sort((a, b) => b.localeCompare(a));

    if (mesesSinResumen.length === 0) {
      alert('✅ Todos los meses tienen resumen. No hay nada que consolidar.');
      return;
    }

    const confirmMsg = `Se van a consolidar ${mesesSinResumen.length} mes(es) sin resumen:\n\n${mesesSinResumen.join(', ')}\n\n¿Continuar?`;
    if (!window.confirm(confirmMsg)) return;

    setCloudStatus(`⏳ Consolidando ${mesesSinResumen.length} mes(es)...`);
    let exitosos = 0;
    for (const mes of mesesSinResumen) {
      const resultado = await saveMonthSummary(mes);
      if (resultado) exitosos++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setCloudStatus(`✅ ${exitosos}/${mesesSinResumen.length} meses consolidados`);
    alert(`📅 ¡${exitosos} de ${mesesSinResumen.length} meses consolidados correctamente!`);
  };

  // ===================== CARGAR DATOS DEL DÍA ANTERIOR (SOLO MES ACTUAL) =====================
  const loadPreviousDayData = () => {
    try {
      console.log('🔄 Cargando datos del día anterior SOLO del mes actual...');

      const diasDelMesActual = Object.entries(historicalData)
        .filter(([date]) => date.startsWith(currentMonth) && date < currentDate)
        .sort(([dateA], [dateB]) => dateB.localeCompare(dateA));

      console.log('Días anteriores en mes actual:', diasDelMesActual.map(([date]) => date));

      if (diasDelMesActual.length > 0) {
        const [fechaAnterior, datosAnterior] = diasDelMesActual[0];
        console.log('📅 Último día del mes actual con datos:', fechaAnterior);
        setTodayData(prev => ({
          ...prev,
          date: currentDate,
          paso1: {
            dato1: '', dato2: '', total: 0,
            acumuladoAnterior: datosAnterior.paso1?.acumulado || 0,
            acumulado: datosAnterior.paso1?.acumulado || 0,
            totalDiaAnterior: datosAnterior.paso1?.total || 0
          },
          paso2: {
            dato1: '', dato2: '', total: 0,
            acumuladoAnterior: datosAnterior.paso2?.acumulado || 0,
            acumulado: datosAnterior.paso2?.acumulado || 0,
            totalDiaAnterior: datosAnterior.paso2?.total || 0
          },
          porcentaje: 0
        }));
      } else {
        console.log('ℹ️ No hay días anteriores en el mes actual, comenzando desde cero');
        setTodayData(prev => ({
          ...prev,
          date: currentDate,
          paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0, totalDiaAnterior: 0 },
          paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0, totalDiaAnterior: 0 },
          porcentaje: 0
        }));
      }
    } catch (error) {
      console.error('Error cargando datos del día anterior:', error);
      setTodayData(prev => ({
        ...prev,
        date: currentDate,
        paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0, totalDiaAnterior: 0 },
        paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0, totalDiaAnterior: 0 },
        porcentaje: 0
      }));
    }
  };

  // ===================== FIX: corregir acumulados erróneos =====================
  const corregirAcumuladosErroneos = () => {
    const diasCorregidos = [];

    const diasDelMes = Object.entries(historicalData)
      .filter(([date]) => date.startsWith(currentMonth))
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB));

    if (diasDelMes.length <= 1) return diasCorregidos;

    for (let i = 0; i < diasDelMes.length; i++) {
      const [fecha, datos] = diasDelMes[i];

      const acumAntCorrectoPaso1 = i > 0 ? (diasDelMes[i-1][1]?.paso1?.acumulado || 0) : 0;
      const acumAntCorrectoPaso2 = i > 0 ? (diasDelMes[i-1][1]?.paso2?.acumulado || 0) : 0;

      const acumCorrectoPaso1 = acumAntCorrectoPaso1 + (datos.paso1?.total || 0);
      const acumCorrectoPaso2 = acumAntCorrectoPaso2 + (datos.paso2?.total || 0);

      if (
        datos.paso1?.acumuladoAnterior !== acumAntCorrectoPaso1 ||
        datos.paso1?.acumulado !== acumCorrectoPaso1 ||
        datos.paso2?.acumuladoAnterior !== acumAntCorrectoPaso2 ||
        datos.paso2?.acumulado !== acumCorrectoPaso2
      ) {
        const datosCorregidos = {
          ...datos,
          paso1: { ...datos.paso1, acumuladoAnterior: acumAntCorrectoPaso1, acumulado: acumCorrectoPaso1 },
          paso2: { ...datos.paso2, acumuladoAnterior: acumAntCorrectoPaso2, acumulado: acumCorrectoPaso2 }
        };

        const totalPaso1 = datos.paso1?.total || 0;
        const totalPaso2 = datos.paso2?.total || 0;
        if (totalPaso1 > 0 && totalPaso2 > 0) {
          const menor = Math.min(totalPaso1, totalPaso2);
          const mayor = Math.max(totalPaso1, totalPaso2);
          datosCorregidos.porcentaje = (menor / mayor) * 100;
        }

        diasDelMes[i][1] = datosCorregidos;

        setHistoricalData(prev => ({ ...prev, [fecha]: datosCorregidos }));
        if (user) saveToFirebase('historicalData', fecha, datosCorregidos);

        diasCorregidos.push(fecha);
        console.log(`✅ Día ${fecha} corregido`);
      }
    }

    if (diasCorregidos.length > 0) console.log(`📊 Días corregidos: ${diasCorregidos.join(', ')}`);
    return diasCorregidos;
  };

  // Ejecutar corrección cuando se cargan los datos
  useEffect(() => {
    if (!loading && Object.keys(historicalData).length > 0) {
      const diasCorregidos = corregirAcumuladosErroneos();
      if (diasCorregidos.length > 0 && diasCorregidos.includes(currentDate)) {
        const datosActualizados = historicalData[currentDate];
        if (datosActualizados) setTodayData(datosActualizados);
      }
    }
  }, [loading]);

  // Función para formatear números como moneda
  const formatCurrency = (value) => {
    const num = parseFloat(value) || 0;
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP',
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(num);
  };

  const parseCurrency = (value) => value.replace(/[^0-9]/g, '');

  const getUserNameById = (userId) => {
    if (!userId) return '';
    const usersMap = sessionUsersMap || {};
    return usersMap[userId] || userId;
  };

  // ===================== LOGIN SIMPLE =====================
  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError('');

    const cedula = (loginCedula || '').trim();
    const password = (loginPassword || '').trim();

    if (!cedula || !password) {
      setLoginError('Debes ingresar cédula y contraseña.');
      return;
    }

    try {
      setLoginLoading(true);
      const FIXED_USER_ID = 'bEY1p1kgVjgk88AlCGa7nM6I1de2';
      const usuariosRef = collection(db, 'users', FIXED_USER_ID, 'usuarios');
      const usuariosSnapshot = await getDocs(usuariosRef);

      let accesoValido = false;
      let usuarioSesionId = '';
      const usersMap = {};
      usuariosSnapshot.forEach((usuarioDoc) => {
        const usuarioData = usuarioDoc.data() || {};
        const usuarioId = String(usuarioDoc.id || '');
        const cedulaDB = String(usuarioData.cedula ?? '').trim();
        const passwordDB = String(usuarioData.password ?? '').trim();
        const nombreDB = String(usuarioData.nombre ?? '').trim();
        if (usuarioId) {
          usersMap[usuarioId] = nombreDB || usuarioId;
        }
        if (cedulaDB === cedula && passwordDB === password) {
          accesoValido = true;
          usuarioSesionId = usuarioId;
        }
      });

      if (!accesoValido) {
        setLoginError('Cédula o contraseña incorrecta.');
        return;
      }

      setIsSessionAuthenticated(true);
      setSessionUserId(usuarioSesionId);
      setSessionUsersMap(usersMap);
      localStorage.setItem('sessionUserId', usuarioSesionId);
      localStorage.setItem('sessionUsersMap', JSON.stringify(usersMap));
      setLoginCedula('');
      setLoginPassword('');
    } catch (err) {
      console.error('Error validando login:', err);
      setLoginError('No fue posible validar el inicio de sesión. Intenta nuevamente.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Manejar cambios en los inputs
  const handleInputChange = (paso, field, value) => {
    const numValue = parseCurrency(value);
    setTodayData(prev => {
      const newData = { ...prev };
      if (!newData[paso]) newData[paso] = {};
      newData[paso][field] = numValue;
      const dato1 = parseFloat(newData[paso].dato1) || 0;
      const dato2 = parseFloat(newData[paso].dato2) || 0;
      newData[paso].total = dato1 + dato2;
      newData[paso].acumulado = (newData[paso].acumuladoAnterior || 0) + newData[paso].total;
      return newData;
    });
  };

  const continuarPaso1 = () => {
    const { dato1, dato2 } = todayData.paso1;
    if (dato1 === '' || dato2 === '' || (parseFloat(dato1) === 0 && parseFloat(dato2) === 0)) {
      alert('⚠️ Debes ingresar al menos un valor diferente de cero en el Paso 1');
      return;
    }
    setCompletedSteps(prev => ({ ...prev, paso1: true }));
    setCurrentView('paso2');
  };

  const continuarPaso2 = () => {
    const { dato1, dato2 } = todayData.paso2;
    if (dato1 === '' || dato2 === '' || (parseFloat(dato1) === 0 && parseFloat(dato2) === 0)) {
      alert('⚠️ Debes ingresar al menos un valor diferente de cero en el Paso 2');
      return;
    }
    setCompletedSteps(prev => ({ ...prev, paso2: true }));
    setCurrentView('resumen');
  };

  const handleEditInputChange = (paso, field, value) => {
    const numValue = parseCurrency(value);
    setEditData(prev => {
      if (!prev) return prev;
      const newData = { ...prev };
      if (!newData[paso]) newData[paso] = {};
      newData[paso][field] = numValue;
      const dato1 = parseFloat(newData[paso].dato1) || 0;
      const dato2 = parseFloat(newData[paso].dato2) || 0;
      newData[paso].total = dato1 + dato2;
      newData[paso].acumulado = (newData[paso].acumuladoAnterior || 0) + newData[paso].total;
      const totalPaso1 = newData.paso1?.total || 0;
      const totalPaso2 = newData.paso2?.total || 0;
      if (totalPaso1 > 0 && totalPaso2 > 0) {
        const menor = Math.min(totalPaso1, totalPaso2);
        const mayor = Math.max(totalPaso1, totalPaso2);
        newData.porcentaje = (menor / mayor) * 100;
      }
      return newData;
    });
  };

  const calculateDayPercentage = (data = null) => {
    const src = data || todayData;
    if (!src || !src.paso1 || !src.paso2) return 0;
    const totalPaso1 = parseFloat(src.paso1.dato1 || 0) + parseFloat(src.paso1.dato2 || 0);
    const totalPaso2 = parseFloat(src.paso2.dato1 || 0) + parseFloat(src.paso2.dato2 || 0);
    if (totalPaso1 > 0 && totalPaso2 > 0) {
      const menor = Math.min(totalPaso1, totalPaso2);
      const mayor = Math.max(totalPaso1, totalPaso2);
      return (menor / mayor) * 100;
    }
    return 0;
  };

  useEffect(() => {
    if (!isDayCompleted && todayData && todayData.paso1 && todayData.paso2) {
      try {
        const porcentajeDia = calculateDayPercentage();
        setTodayData(prev => ({ ...prev, porcentaje: porcentajeDia }));
      } catch (error) {
        console.error('Error calculando porcentaje en tiempo real:', error);
      }
    }
  }, [todayData?.paso1?.dato1, todayData?.paso1?.dato2, todayData?.paso2?.dato1, todayData?.paso2?.dato2, isDayCompleted]);

  // ===================== SELECCIONAR FECHA EN CALENDARIO =====================
  const selectCalendarDate = (date) => {
    const data = historicalData[date];
    const mesDeLaFecha = date.slice(0, 7);

    if (data) {
      viewHistoricalData(date);
    } else if (mesDeLaFecha < currentMonth && !isLastDayOfItsMonth(date)) {
      alert(`❌ No puedes registrar datos en meses anteriores.\n\nEl día ${date} pertenece al mes ${mesDeLaFecha}.\n\nSolo el último día (28, 29, 30 o 31 según el mes) de cada mes pasado puede registrarse si aún no tiene datos.`);
    } else {
      if (window.confirm(`¿Quieres registrar datos para el día ${date}?`)) {
        setupDateForRegistration(date);
      }
    }
  };

  const setupDateForRegistration = (date) => {
    const selectedMonth = date.slice(0, 7);

    if (selectedMonth < currentMonth && !isLastDayOfItsMonth(date)) {
      alert(`❌ No puedes registrar datos en meses anteriores.\n\nLa fecha ${date} pertenece a un mes pasado (${selectedMonth}).\n\nSolo el último día de cada mes pasado puede registrarse si aún no tiene datos.`);
      return;
    }

    const diasDelMes = Object.entries(historicalData)
      .filter(([d]) => d.startsWith(selectedMonth) && d < date)
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA));

    let acumuladoAnteriorPaso1 = 0;
    let acumuladoAnteriorPaso2 = 0;

    if (diasDelMes.length > 0) {
      const ultimoDia = diasDelMes[0][1];
      acumuladoAnteriorPaso1 = ultimoDia.paso1?.acumulado || 0;
      acumuladoAnteriorPaso2 = ultimoDia.paso2?.acumulado || 0;
    }

    setTodayData({
      date,
      paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: acumuladoAnteriorPaso1, acumulado: acumuladoAnteriorPaso1, totalDiaAnterior: 0 },
      paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: acumuladoAnteriorPaso2, acumulado: acumuladoAnteriorPaso2, totalDiaAnterior: 0 },
      porcentaje: 0
    });
    setIsDayCompleted(false);
    setCompletedSteps({ paso1: false, paso2: false });
    setCurrentView('paso1');
    setSelectedDate(date);
    setShowCalendar(false);

    alert(`✅ Listo para registrar datos del ${date}\n\n📊 Acumulados cargados SOLO de días anteriores del mismo mes.`);
  };

  // ===================== GUARDAR DATOS DEL DÍA =====================
  const saveData = async () => {
    try {
      const saveDate = selectedDate || currentDate;
      const mesDelDia = saveDate.slice(0, 7);
      const nowISO = getNowColombiaISO();

      console.log('💾 Guardando datos para el día:', saveDate);

      if (new Date(saveDate) > new Date()) {
        alert('❌ No puedes registrar datos para días futuros.');
        return;
      }

      if (isLimitedUser && saveDate !== currentDate) {
        alert(`⛔ Tu usuario solo puede registrar datos del día actual (${currentDate}).`);
        return;
      }

      const esMesAnteriorNoEditable = mesDelDia < currentMonth && !isLastDayOfItsMonth(saveDate);
      if (esMesAnteriorNoEditable) {
        alert(`❌ No puedes guardar datos en días de meses anteriores.\n\nSolo se permite editar el ÚLTIMO día de cada mes pasado.`);
        return;
      }

      const diasDelMes = Object.entries(historicalData)
        .filter(([date]) => date.startsWith(mesDelDia) && date < saveDate)
        .sort(([dateA], [dateB]) => dateB.localeCompare(dateA));

      let acumuladoAnteriorPaso1 = 0;
      let acumuladoAnteriorPaso2 = 0;

      if (diasDelMes.length > 0) {
        const ultimoDia = diasDelMes[0][1];
        acumuladoAnteriorPaso1 = ultimoDia.paso1?.acumulado || 0;
        acumuladoAnteriorPaso2 = ultimoDia.paso2?.acumulado || 0;
      }

      const totalDiaPaso1 = parseFloat(todayData.paso1.dato1 || 0) + parseFloat(todayData.paso1.dato2 || 0);
      const totalDiaPaso2 = parseFloat(todayData.paso2.dato1 || 0) + parseFloat(todayData.paso2.dato2 || 0);

      const nuevoAcumuladoPaso1 = acumuladoAnteriorPaso1 + totalDiaPaso1;
      const nuevoAcumuladoPaso2 = acumuladoAnteriorPaso2 + totalDiaPaso2;

      let porcentajeDia = 0;
      try { porcentajeDia = calculateDayPercentage(); } catch (e) { porcentajeDia = 0; }

      const datosDia = {
        date: saveDate,
        usuarioRegistroId: sessionUserId || localStorage.getItem('sessionUserId') || '',
        fechaRegistro: nowISO,
        paso1: {
          dato1: todayData.paso1.dato1 || '',
          dato2: todayData.paso1.dato2 || '',
          total: totalDiaPaso1,
          acumuladoAnterior: acumuladoAnteriorPaso1,
          acumulado: nuevoAcumuladoPaso1,
          totalDiaAnterior: todayData.paso1.totalDiaAnterior || 0
        },
        paso2: {
          dato1: todayData.paso2.dato1 || '',
          dato2: todayData.paso2.dato2 || '',
          total: totalDiaPaso2,
          acumuladoAnterior: acumuladoAnteriorPaso2,
          acumulado: nuevoAcumuladoPaso2,
          totalDiaAnterior: todayData.paso2.totalDiaAnterior || 0
        },
        porcentaje: porcentajeDia
      };

      console.log('💾 Guardando datos para fecha:', saveDate, datosDia);

      let nuevosHistoricalData = { ...historicalData, [saveDate]: datosDia };

      const diasOrdenados = Object.entries(nuevosHistoricalData)
        .filter(([date]) => date.startsWith(mesDelDia))
        .sort((a, b) => a[0].localeCompare(b[0]));

      for (let i = 0; i < diasOrdenados.length; i++) {
        const fecha = diasOrdenados[i][0];
        let datos = { ...diasOrdenados[i][1] };
        
        if (!datos.paso1) datos.paso1 = {};
        if (!datos.paso2) datos.paso2 = {};
        
        const totalDiaPaso1 = parseFloat(datos.paso1.dato1 || 0) + parseFloat(datos.paso1.dato2 || 0);
        const totalDiaPaso2 = parseFloat(datos.paso2.dato1 || 0) + parseFloat(datos.paso2.dato2 || 0);
        datos.paso1.total = totalDiaPaso1;
        datos.paso2.total = totalDiaPaso2;
        
        if (i === 0) {
          datos.paso1.acumuladoAnterior = 0;
          datos.paso1.acumulado = totalDiaPaso1;
          datos.paso2.acumuladoAnterior = 0;
          datos.paso2.acumulado = totalDiaPaso2;
        } else {
          const datosAnterior = nuevosHistoricalData[diasOrdenados[i-1][0]];
          datos.paso1.acumuladoAnterior = parseFloat(datosAnterior.paso1?.acumulado) || 0;
          datos.paso1.acumulado = (parseFloat(datosAnterior.paso1?.acumulado) || 0) + totalDiaPaso1;
          datos.paso2.acumuladoAnterior = parseFloat(datosAnterior.paso2?.acumulado) || 0;
          datos.paso2.acumulado = (parseFloat(datosAnterior.paso2?.acumulado) || 0) + totalDiaPaso2;
        }
        
        if (totalDiaPaso1 > 0 && totalDiaPaso2 > 0) {
          const menor = Math.min(totalDiaPaso1, totalDiaPaso2);
          const mayor = Math.max(totalDiaPaso1, totalDiaPaso2);
          datos.porcentaje = (menor / mayor) * 100;
        } else {
          datos.porcentaje = 0;
        }
        
        nuevosHistoricalData[fecha] = datos;
      }

      setHistoricalData(nuevosHistoricalData);
      setTodayData(datosDia);

      if (user) {
        const diasDelMesParaGuardar = Object.entries(nuevosHistoricalData)
          .filter(([date]) => date.startsWith(mesDelDia));
        for (const [fecha, datos] of diasDelMesParaGuardar) {
          await saveToFirebase('historicalData', fecha, datos);
        }
        setCloudStatus('💾 Datos sincronizados en la nube');
      }

      const debeReconsolidarMes = isLastDayOfItsMonth(saveDate) || (mesDelDia < currentMonth) || !!monthlyData?.[mesDelDia];
      if (debeReconsolidarMes) {
        console.log(`✅ Re-consolidando mes ${mesDelDia} por cambios en sus días`);
        const consolidacionExitosa = await saveMonthSummary(mesDelDia, nuevosHistoricalData);
        if (consolidacionExitosa) {
          console.log(`✅ Mes ${mesDelDia} consolidado correctamente`);
        } else {
          console.warn(`⚠️ Consolidación del mes ${mesDelDia} no se completó totalmente`);
        }
      }

      setIsDayCompleted(true);
      setCompletedSteps({ paso1: true, paso2: true });
      setCurrentView('resumen');
      setSelectedDate(null);

      alert(`✅ Día ${saveDate} guardado exitosamente.\n\n📊 Los acumulados del mes han sido actualizados correctamente.`);

    } catch (error) {
      console.error('Error al guardar datos:', error);
      alert('❌ Error al guardar los datos. Intenta nuevamente.');
    }
  };

  // ===================== EDICIÓN =====================
  const startEditing = (date) => {
    const dataToEdit = historicalData[date];
    if (isLimitedUser && !canLimitedUserWorkOnDate(date)) {
      alert(`⛔ Tu usuario solo puede editar datos del día anterior.\n\nFecha permitida: ${yesterdayISO}`);
      return;
    }
    if (!canEditDate(date)) {
      alert(`❌ No puedes editar datos de este día.\n\nSolo se puede editar el mes actual o el último día de meses anteriores.\n\nEl día ${date} no cumple ninguna condición.`);
      return;
    }
    setEditData({ ...dataToEdit });
    setIsEditing(true);
  };

  const saveEdit = async () => {
    try {
      if (isLimitedUser && !canLimitedUserWorkOnDate(editData?.date)) {
        alert(`⛔ Tu usuario solo puede guardar cambios del día anterior.\n\nFecha permitida: ${yesterdayISO}`);
        return;
      }
      let newHistoricalData = { ...historicalData, [editData.date]: { ...editData } };
      const editUserId = sessionUserId || localStorage.getItem('sessionUserId') || '';
      const nowISO = getNowColombiaISO();
      newHistoricalData[editData.date] = {
        ...(newHistoricalData[editData.date] || {}),
        usuarioEdicionId: editUserId,
        fechaEdicion: nowISO
      };

      const mesDelDia = editData.date.slice(0, 7);
      const diasOrdenados = Object.entries(newHistoricalData)
        .filter(([date]) => date.startsWith(mesDelDia))
        .sort((a, b) => a[0].localeCompare(b[0]));

      for (let i = 0; i < diasOrdenados.length; i++) {
        const fecha = diasOrdenados[i][0];
        let datos = { ...diasOrdenados[i][1] };
        
        if (!datos.paso1) datos.paso1 = {};
        if (!datos.paso2) datos.paso2 = {};
        
        const totalDiaPaso1 = parseFloat(datos.paso1.dato1 || 0) + parseFloat(datos.paso1.dato2 || 0);
        const totalDiaPaso2 = parseFloat(datos.paso2.dato1 || 0) + parseFloat(datos.paso2.dato2 || 0);
        datos.paso1.total = totalDiaPaso1;
        datos.paso2.total = totalDiaPaso2;
        
        if (i === 0) {
          datos.paso1.acumuladoAnterior = 0;
          datos.paso1.acumulado = totalDiaPaso1;
          datos.paso2.acumuladoAnterior = 0;
          datos.paso2.acumulado = totalDiaPaso2;
        } else {
          const datosAnterior = newHistoricalData[diasOrdenados[i-1][0]];
          datos.paso1.acumuladoAnterior = datosAnterior.paso1?.acumulado || 0;
          datos.paso1.acumulado = (datosAnterior.paso1?.acumulado || 0) + totalDiaPaso1;
          datos.paso2.acumuladoAnterior = datosAnterior.paso2?.acumulado || 0;
          datos.paso2.acumulado = (datosAnterior.paso2?.acumulado || 0) + totalDiaPaso2;
        }
        
        if (totalDiaPaso1 > 0 && totalDiaPaso2 > 0) {
          const menor = Math.min(totalDiaPaso1, totalDiaPaso2);
          const mayor = Math.max(totalDiaPaso1, totalDiaPaso2);
          datos.porcentaje = (menor / mayor) * 100;
        } else {
          datos.porcentaje = 0;
        }
        
        newHistoricalData[fecha] = datos;
      }

      setHistoricalData(newHistoricalData);

      if (user) {
        for (const [fecha, datos] of Object.entries(newHistoricalData).filter(([date]) => date.startsWith(mesDelDia))) {
          await saveToFirebase('historicalData', fecha, datos);
        }
        setCloudStatus('💾 Cambios guardados en la nube');
      }

      const debeReconsolidarMes = isLastDayOfItsMonth(editData.date) || (mesDelDia < currentMonth) || !!monthlyData?.[mesDelDia];
      if (debeReconsolidarMes) {
        console.log(`✅ Re-consolidando mes ${mesDelDia} por cambios en sus días`);
        const consolidacionExitosa = await saveMonthSummary(mesDelDia, newHistoricalData);
        if (consolidacionExitosa) {
          console.log(`✅ Mes ${mesDelDia} re-consolidado después de edición`);
        } else {
          console.warn(`⚠️ Re-consolidación del mes ${mesDelDia} no se completó totalmente`);
        }
      }

      if (editData.date === currentDate) {
        setTodayData(newHistoricalData[currentDate] || editData);
      }

      setSelectedDate(null);
      setIsEditing(false);
      setEditData(null);
      alert('✅ Cambios guardados exitosamente.');
    } catch (error) {
      console.error('Error saving edit:', error);
      alert('❌ Error al guardar los cambios. Intenta nuevamente.');
    }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditData(null);
  };

  const viewHistoricalData = (date) => {
    setSelectedDate(date);
    setShowCalendar(false);
  };

  // ===================== CALENDARIO =====================
  const generateCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days = [];

    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateString = date.toISOString().split('T')[0];
      const hasData = historicalData.hasOwnProperty(dateString);
      const isToday = dateString === currentDate;
      const isFutureDate = new Date(dateString) > new Date(currentDate);
      const mesDeLaFecha = dateString.slice(0, 7);
      const esMesAnterior = mesDeLaFecha < currentMonth;
      const esUltimoDiaMes = isLastDayOfItsMonth(dateString);
      const mesData = monthlyData[mesDeLaFecha];
      const estaOculto = mesData?.estado === 1;
      days.push({ day, date: dateString, hasData, isToday, isFutureDate, esMesAnterior, esUltimoDiaMes, estaOculto });
    }

    return days;
  };

  const changeMonth = (increment) => {
    setCalendarMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + increment);
      return newDate;
    });
  };

  const renderCalendar = () => {
    const days = generateCalendarDays();
    const monthName = calendarMonth.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Historial</h2>
          <button onClick={() => setShowCalendar(false)} className="text-gray-500 hover:text-gray-700 text-2xl">✕</button>
        </div>

        <div className="flex items-center justify-between mb-4">
          <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={24} /></button>
          <h3 className="text-xl font-semibold capitalize">{monthName}</h3>
          <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight size={24} /></button>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {weekDays.map(day => (
            <div key={day} className="text-center font-semibold text-gray-600 text-sm">{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((dayInfo, index) => {
            if (!dayInfo) return <div key={`empty-${index}`} className="aspect-square"></div>;

            const { day, date, hasData, isToday, isFutureDate, esMesAnterior, esUltimoDiaMes, estaOculto } = dayInfo;
            const isSelectable = !isFutureDate && (!esMesAnterior || hasData || esUltimoDiaMes) && !estaOculto;

            let bgColor = 'bg-gray-100';
            let textColor = 'text-gray-700';
            let hoverColor = 'hover:bg-gray-200';
            let cursor = isSelectable ? 'cursor-pointer' : 'cursor-not-allowed';
            let titleText = 'Registrar día';

            if (estaOculto) {
              bgColor = 'bg-gray-300';
              textColor = 'text-gray-500';
              hoverColor = '';
              cursor = 'cursor-not-allowed';
              titleText = 'Mes limpio - Datos ocultos';
            } else if (hasData) {
              if (esMesAnterior) {
                if (esUltimoDiaMes) {
                  bgColor = 'bg-orange-400';
                  textColor = 'text-white';
                  hoverColor = 'hover:bg-orange-500';
                  titleText = 'Último día del mes - Editable';
                } else {
                  bgColor = 'bg-amber-100';
                  textColor = 'text-amber-800';
                  hoverColor = 'hover:bg-amber-200';
                  titleText = 'Mes anterior - Solo ver porcentaje';
                }
              } else {
                bgColor = 'bg-blue-500';
                textColor = 'text-white';
                hoverColor = 'hover:bg-blue-600';
                titleText = 'Ver/editar datos';
              }
            } else if (isFutureDate) {
              bgColor = 'bg-gray-50';
              textColor = 'text-gray-400';
              hoverColor = '';
              titleText = 'Fecha futura';
            } else if (esMesAnterior && esUltimoDiaMes) {
              bgColor = 'bg-orange-300';
              textColor = 'text-white';
              hoverColor = 'hover:bg-orange-400';
              titleText = 'Último día del mes - Puedes registrar datos';
            } else if (esMesAnterior) {
              bgColor = 'bg-gray-100';
              textColor = 'text-gray-400';
              hoverColor = '';
              titleText = 'Mes anterior - Sin datos';
            }

            return (
              <button
                key={date}
                onClick={() => isSelectable ? selectCalendarDate(date) : null}
                disabled={!isSelectable}
                className={`aspect-square p-2 rounded-lg font-semibold transition-all relative ${bgColor} ${textColor} ${hoverColor} ${cursor} ${isToday ? 'ring-2 ring-green-500' : ''}`}
                title={titleText}
              >
                {day}
                {hasData && !estaOculto && (
                  <div
                    className="absolute top-1 right-1 w-2 h-2 rounded-full"
                    style={{ backgroundColor: esMesAnterior ? (esUltimoDiaMes ? '#fff' : '#f59e0b') : '#ffffff' }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 text-sm text-gray-600 space-y-1">
          <p>• <span className="text-blue-500 font-semibold">Azul</span>: Mes actual - editable</p>
          <p>• <span className="text-orange-400 font-semibold">Naranja</span>: Último día de mes anterior - editable</p>
          <p>• <span className="text-amber-500 font-semibold">Ámbar</span>: Mes anterior - solo ver porcentaje</p>
          <p>• <span className="text-gray-700 font-semibold">Gris</span>: Sin datos / disponible para registrar</p>
          <p>• <span className="text-green-500 font-semibold">Borde verde</span>: Hoy</p>
        </div>
      </div>
    );
  };

  // ===================== HISTORIAL MENSUAL =====================
  const renderMonthlyHistory = () => {
    // Filtrar meses con estado 1 (limpiado/oculto)
    const months = Object.entries(monthlyData)
      .filter(([monthKey, data]) => monthKey !== currentMonth && data.estado !== 1)
      .sort((a, b) => b[0].localeCompare(a[0]));

    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">📊 Historial de Meses Completados</h2>
          <button onClick={() => setShowMonthlyHistory(false)} className="text-gray-500 hover:text-gray-700 text-2xl">✕</button>
        </div>

        <div className="mb-4 bg-yellow-50 border border-yellow-300 rounded-lg p-3 text-sm text-yellow-800">
          <p className="font-semibold">¿No ves un mes en la lista?</p>
          <p className="mt-1">Puedes consolidarlo manualmente si ya terminó:</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {[...Array(4)].map((_, i) => {
              const d = new Date();
              d.setMonth(d.getMonth() - (i + 1));
              const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              const tieneDatos = Object.keys(historicalData).some(date => date.startsWith(mk));
              const tieneResumen = !!monthlyData[mk];
              if (!tieneDatos) return null;
              return (
                <button
                  key={mk}
                  onClick={() => consolidarMesManual(mk)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${tieneResumen ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200' : 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'}`}
                >
                  {tieneResumen ? `✅ ${mk} (re-consolidar)` : `⚠️ ${mk} (SIN resumen)`}
                </button>
              );
            })}
          </div>
        </div>

        {months.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No hay meses visibles</p>
            <p className="text-sm text-gray-600">
              {Object.keys(monthlyData).filter(m => m !== currentMonth).length > 0 
                ? "Todos los meses han sido limpiados de la interfaz."
                : "El mes actual ({currentMonth}) no aparece aquí. Usa el botón de arriba para consolidar un mes pasado."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {months.map(([monthKey, data]) => {
              if (!data) return null;
              const porcentaje = data.porcentajeFinal || 0;

              return (
                <div key={monthKey} className="border rounded-lg p-4 bg-gradient-to-r from-blue-50 to-purple-50">
                  <div className="mt-3 text-center">
                    <h3 className="font-bold text-lg">{monthKey}</h3>
                    <p className="text-gray-600">Porcentaje final:</p> 
                    <p className="font-bold text-2xl text-purple-900">{porcentaje.toFixed(2)}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 space-y-4">
          <div className="bg-gradient-to-r from-green-50 to-teal-50 border-l-4 border-green-500 p-4 rounded-lg">
            <h4 className="font-bold text-green-900 mb-3 text-lg">📤 Exportar Reportes</h4>
            <div className="space-y-2">
              <button
                onClick={() => exportToExcel('full')}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
              >
                <Download size={20} /><span>EXPORTAR REPORTE COMPLETO</span>
              </button>
              <button
                onClick={() => exportToExcel('daily')}
                className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2"
              >
                <Download size={20} /><span>EXPORTAR DETALLE DIARIO DEL MES</span>
              </button>
              <button
                onClick={exportDailySummaryToExcel}
                className="w-full bg-orange-500 text-white py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors flex items-center justify-center space-x-2"
              >
                <Download size={20} /><span>EXPORTAR PORCENTAJE DIARIO</span>
              </button>
              <button
                onClick={exportAllDataToJSON}
                className="w-full bg-gray-700 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2"
              >
                <Download size={20} /><span>EXPORTAR BACKUP (JSON)</span>
              </button>
              <button
                onClick={abrirModalLimpiar}
                className="w-full bg-red-500 text-white py-3 rounded-lg font-semibold hover:bg-red-600 transition-colors flex items-center justify-center space-x-2"
              >
                <X size={20} /><span>LIMPIAR DATOS</span>
              </button>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-bold text-blue-900 mb-2">📤 Importar Datos</h4>
            <label className="relative group flex-1 bg-blue-500 text-white py-2 rounded-lg font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2 cursor-pointer">
              <span>📥 Importar desde JSON</span>
              <input type="file" accept=".json,.txt" onChange={importData} className="hidden" />
            </label>
            <p className="text-xs text-gray-600 mt-2 text-center">💡 Solo archivos JSON exportados desde esta aplicación</p>
          </div>

          <div className="text-sm text-gray-500">
            <p>📈 <strong>Estadísticas actuales:</strong></p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Meses registrados: {Object.keys(monthlyData).length}</li>
              <li>Días registrados totales: {Object.keys(historicalData).length}</li>
              <li>Mes actual: {currentMonth}</li>
              <li>Días en el mes actual: {Object.keys(historicalData).filter(date => date.startsWith(currentMonth)).length}</li>
            </ul>
            <p className="mt-3">☁️ {cloudStatus}</p>
          </div>
        </div>
      </div>
    );
  };

  // ===================== MODAL PARA LIMPIAR DATOS =====================
  if (showCleanModal) {
    const mesesDisponibles = Object.keys(monthlyData).filter(m => m !== currentMonth && monthlyData[m]?.estado !== 1).sort().reverse();
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">🧹 Limpiar Datos</h2>
          <p className="text-gray-600 mb-4 text-sm">
            Selecciona el mes que quieres limpiar de la interfaz.
          </p>
          
          <select
            value={selectedMonthToClean}
            onChange={(e) => setSelectedMonthToClean(e.target.value)}
            className="w-full p-3 border-2 rounded-lg mb-4 focus:outline-none focus:border-blue-500"
          >
            <option value="">-- Selecciona un mes --</option>
            <option value="TODOS">📁 TODOS los meses anteriores</option>
            {mesesDisponibles.map(mes => (
              <option key={mes} value={mes}>{mes}</option>
            ))}
          </select>
          
          <div className="flex space-x-3">
            <button
              onClick={confirmarLimpiarMes}
              className="flex-1 bg-red-500 text-white py-2 rounded-lg font-semibold hover:bg-red-600"
            >
              Limpiar
            </button>
            <button
              onClick={() => { setShowCleanModal(false); setSelectedMonthToClean(''); }}
              className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-400"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===================== VISTA HISTÓRICA =====================
  const renderHistoricalView = () => {
    if (!selectedDate) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <p className="text-gray-600 text-center py-8">No se ha seleccionado una fecha.</p>
              <button onClick={() => { setSelectedDate(null); setIsEditing(false); setEditData(null); }}
                className="w-full bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors">
                Volver
              </button>
            </div>
          </div>
        </div>
      );
    }

    const data = historicalData[selectedDate];
    const mesDeLaFecha = selectedDate.slice(0, 7);
    const existeDato = !!data;
    // Mes anterior: si el día existe, se permite editar; si NO existe, sigue solo lectura
    // excepto el último día del mes (que se mantiene editable/ingresable como antes).
    const esMesAnteriorSoloLectura = mesDeLaFecha < currentMonth && !isLastDayOfItsMonth(selectedDate) && !existeDato;
    const esMesAnteriorEditable = mesDeLaFecha < currentMonth && isLastDayOfItsMonth(selectedDate);
    const esNuevoDia = !data && !editData;

    if (esNuevoDia) {
      if (isLimitedUser && !canLimitedUserWorkOnDate(selectedDate)) {
        return (
          <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
            <div className="max-w-2xl mx-auto">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Acceso restringido</h2>
                <p className="text-gray-700">
                  Tu usuario solo puede registrar o editar datos del día anterior.
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  Fecha permitida: <span className="font-semibold">{yesterdayISO}</span>
                </p>
                <button
                  onClick={() => { setSelectedDate(null); setIsEditing(false); setEditData(null); }}
                  className="w-full mt-6 bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
                >
                  Volver
                </button>
              </div>
            </div>
          </div>
        );
      }
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Registrar datos para el {selectedDate}</h2>
                <button onClick={() => { setSelectedDate(null); setIsEditing(false); setEditData(null); }}
                  className="text-gray-500 hover:text-gray-700 text-2xl">✕</button>
              </div>

              <div className="mb-6 bg-blue-50 p-4 rounded-lg">
                <p className="text-blue-800"><span className="font-bold">📝 Registrando datos para:</span> {selectedDate}</p>
              </div>

              <div className="space-y-6">
                {['paso1', 'paso2'].map((paso, idx) => (
                  <div key={paso} className={`border rounded-lg p-4 ${idx === 0 ? 'bg-blue-50' : 'bg-green-50'}`}>
                    <h3 className={`font-bold text-lg mb-3 ${idx === 0 ? 'text-blue-900' : 'text-green-900'}`}>
                      Paso {idx + 1}
                    </h3>
                    <div className="space-y-3">
                      {['dato1', 'dato2'].map(field => (
                        <div key={field}>
                          <label className="block text-gray-700 font-semibold mb-1 text-sm">
                            {field === 'dato1' ? 'Dato 1' : 'Dato 2'}
                          </label>
                          <input
                            type="text"
                            value={formatCurrency(todayData[paso]?.[field] || '')}
                            onChange={(e) => handleInputChange(paso, field, e.target.value)}
                            className={`w-full p-2 border-2 rounded-lg focus:outline-none ${idx === 0 ? 'border-blue-300 focus:border-blue-500' : 'border-green-300 focus:border-green-500'}`}
                            placeholder="$0"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="border rounded-lg p-4 bg-purple-50">
                  <h3 className="font-bold text-lg mb-3 text-purple-900">Resumen del Día</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-3 rounded-lg">
                      <p className="text-sm text-gray-600">Total Paso 1:</p>
                      <p className="font-bold text-lg text-blue-900">{formatCurrency(todayData.paso1?.total || 0)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg">
                      <p className="text-sm text-gray-600">Total Paso 2:</p>
                      <p className="font-bold text-lg text-green-900">{formatCurrency(todayData.paso2?.total || 0)}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-purple-200">
                    <p className="text-sm text-gray-600">Total del día:</p>
                    <p className="font-bold text-2xl text-purple-900">
                      {formatCurrency((todayData.paso1?.total || 0) + (todayData.paso2?.total || 0))}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <button onClick={saveData}
                    className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors flex items-center justify-center space-x-2">
                    <Save size={20} /><span>Guardar Datos</span>
                  </button>
                  <button onClick={() => { setSelectedDate(null); setIsEditing(false); setEditData(null); setShowCalendar(true); }}
                    className="w-full bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors">
                    Cancelar y volver al calendario
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (esMesAnteriorSoloLectura) {
      const calcularPorcentajeAcumuladoMes = () => {
        const monthKey = mesDeLaFecha;
        const monthDays = Object.entries(historicalData)
          .filter(([date]) => date.startsWith(monthKey) && date <= selectedDate)
          .sort((a, b) => a[0].localeCompare(b[0]));
        if (monthDays.length === 0) return 0;
        const lastDay = monthDays[monthDays.length - 1][1];
        const acum1 = lastDay.paso1?.acumulado || 0;
        const acum2 = lastDay.paso2?.acumulado || 0;
        if (acum1 > 0 && acum2 > 0) {
          return (Math.min(acum1, acum2) / Math.max(acum1, acum2)) * 100;
        }
        return 0;
      };

      const porcentajeAcumuladoMes = calcularPorcentajeAcumuladoMes();
      const porcentajeDia = data?.porcentaje?.toFixed(2) || 0;

      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </h2>
                <button onClick={() => { setSelectedDate(null); setIsEditing(false); setEditData(null); }}
                  className="text-gray-500 hover:text-gray-700 text-2xl">✕</button>
              </div>

              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-6 rounded-lg">
                <p className="text-yellow-800 font-semibold">📊 Mes anterior - Solo lectura</p>
                <p className="text-sm text-yellow-700 mt-1">Este día pertenece a un mes anterior y no es el último día del mes.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="border rounded-lg p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 text-center">
                  <p className="text-sm text-gray-600 mb-1">% del día</p>
                  <p className="font-bold text-5xl text-amber-700">{porcentajeDia}%</p>
                </div>
                <div className="border rounded-lg p-6 bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200 text-center">
                  <p className="text-sm text-gray-600 mb-1">% acumulado del mes</p>
                  <p className="font-bold text-5xl text-purple-700">{porcentajeAcumuladoMes.toFixed(2)}%</p>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-600">
                  Usuario que registró: <span className="font-semibold text-gray-800">{data?.usuarioRegistroId ? getUserNameById(data?.usuarioRegistroId) : 'No disponible'}</span>
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Usuario que editó: <span className="font-semibold text-gray-800">{data?.usuarioEdicionId ? getUserNameById(data?.usuarioEdicionId) : 'Sin edición'}</span>
                </p>
              </div>

              <button
                onClick={() => { setSelectedDate(null); setEditData(null); setShowCalendar(true); }}
                className="w-full bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors">
                Volver al Calendario
              </button>
            </div>
          </div>
        </div>
      );
    }

    const calcularPorcentajesMes = () => {
      const monthKey = selectedDate.slice(0, 7);
      const monthDays = Object.entries(historicalData)
        .filter(([date]) => date.startsWith(monthKey) && date <= selectedDate)
        .sort((a, b) => a[0].localeCompare(b[0]));
      if (monthDays.length === 0) return { paso1: 0, paso2: 0, total: 0, porcentaje: 0 };
      const lastDay = monthDays[monthDays.length - 1][1];
      const acum1 = lastDay.paso1?.acumulado || 0;
      const acum2 = lastDay.paso2?.acumulado || 0;
      const total = acum1 + acum2;
      let porcentaje = 0;
      if (acum1 > 0 && acum2 > 0) porcentaje = (Math.min(acum1, acum2) / Math.max(acum1, acum2)) * 100;
      return { paso1: acum1, paso2: acum2, total, porcentaje };
    };

    const calcularPorcentajeDiaHistorico = () => {
      if (!data || !data.paso1 || !data.paso2) return 0;
      const t1 = data.paso1.total || 0;
      const t2 = data.paso2.total || 0;
      if (t1 > 0 && t2 > 0) return (Math.min(t1, t2) / Math.max(t1, t2)) * 100;
      return 0;
    };

    const monthAccumulated = calcularPorcentajesMes();
    const dayPercentage = calcularPorcentajeDiaHistorico();
    const puedeEditar = canEditDate(selectedDate) && (!isLimitedUser || canLimitedUserWorkOnDate(selectedDate));

    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h2>
          <button onClick={() => { setSelectedDate(null); setIsEditing(false); setEditData(null); }}
            className="text-gray-500 hover:text-gray-700 text-2xl">✕</button>
        </div>

        {esMesAnteriorEditable && (
          <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-4 rounded-lg">
            <p className="text-orange-800 font-semibold">🔓 Último día del mes anterior - Editable</p>
            <p className="text-sm text-orange-700 mt-1">Puedes editar los datos de este día. Al guardar se re-consolidará el mes.</p>
          </div>
        )}

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 bg-amber-50 border-amber-200 text-center">
              <p className="text-sm text-gray-600 mb-1">% del día</p>
              <p className="font-bold text-3xl text-amber-700">{dayPercentage.toFixed(2)}%</p>
            </div>
            <div className="border rounded-lg p-4 bg-purple-50 border-purple-200 text-center">
              <p className="text-sm text-gray-600 mb-1">% acumulado del mes</p>
              <p className="font-bold text-3xl text-purple-700">{monthAccumulated.porcentaje.toFixed(2)}%</p>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              Usuario que registró: <span className="font-semibold text-gray-800">{data?.usuarioRegistroId ? getUserNameById(data?.usuarioRegistroId) : 'No disponible'}</span>
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Usuario que editó: <span className="font-semibold text-gray-800">{data?.usuarioEdicionId ? getUserNameById(data?.usuarioEdicionId) : 'Sin edición'}</span>
            </p>
          </div>

          {isEditing ? (
            <div className="space-y-6">
              {['paso1', 'paso2'].map((paso, idx) => (
                <div key={paso} className={`border rounded-lg p-4 ${idx === 0 ? 'bg-blue-50' : 'bg-green-50'}`}>
                  <h3 className={`font-bold text-lg mb-3 ${idx === 0 ? 'text-blue-900' : 'text-green-900'}`}>Paso {idx + 1}</h3>
                  <div className="space-y-3">
                    {['dato1', 'dato2'].map(field => (
                      <div key={field}>
                        <label className="block text-gray-700 font-semibold mb-1 text-sm">
                          {field === 'dato1' ? 'Dato 1' : 'Dato 2'}
                        </label>
                        <input
                          type="text"
                          value={formatCurrency(editData?.[paso]?.[field] || '')}
                          onChange={(e) => handleEditInputChange(paso, field, e.target.value)}
                          className={`w-full p-2 border-2 rounded-lg focus:outline-none ${idx === 0 ? 'border-blue-300 focus:border-blue-500' : 'border-green-300 focus:border-green-500'}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-700 font-semibold text-center">📊 Datos del día {selectedDate}</p>
              <p className="text-sm text-gray-600 text-center mt-1">
                {puedeEditar ? 'Haz clic en "Editar Datos" para modificar.' : 'Este día es de solo lectura.'}
              </p>
            </div>
          )}

          <div className="mt-6 space-y-3">
            {isEditing ? (
              <div className="flex space-x-3">
                <button onClick={saveEdit}
                  className="flex-1 bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors flex items-center justify-center space-x-2">
                  <Check size={20} /><span>Guardar Cambios</span>
                </button>
                <button onClick={cancelEdit}
                  className="flex-1 bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors flex items-center justify-center space-x-2">
                  <X size={20} /><span>Cancelar</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {puedeEditar && (
                  <button onClick={() => startEditing(selectedDate)}
                    className="w-full bg-orange-500 text-white py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors flex items-center justify-center space-x-2">
                    <Edit2 size={20} /><span>Editar Datos</span>
                  </button>
                )}
                <button
                  onClick={() => { setSelectedDate(null); setEditData(null); setShowCalendar(true); }}
                  className="w-full bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors">
                  Volver al Calendario
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ===================== LOADING =====================
  if (!isSessionAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Iniciar sesión</h2>
          <p className="text-gray-600 mb-6">Ingresa tu cédula y contraseña para continuar.</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Cédula</label>
              <input
                type="text"
                value={loginCedula}
                onChange={(e) => setLoginCedula(e.target.value)}
                className="w-full p-3 border-2 border-blue-300 rounded-lg text-lg focus:border-blue-500 focus:outline-none"
                placeholder="Ej: 123456789"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-2">Contraseña</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full p-3 border-2 border-blue-300 rounded-lg text-lg focus:border-blue-500 focus:outline-none"
                placeholder="********"
              />
            </div>

            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className={`w-full py-3 rounded-lg font-semibold transition-colors ${loginLoading ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
            >
              {loginLoading ? 'Validando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando datos...</p>
          <p className="text-sm text-gray-500 mt-2">Verificando si hoy ya fue registrado</p>
        </div>
      </div>
    );
  }

  if (showMonthlyHistory) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
        <div className="max-w-2xl mx-auto">{renderMonthlyHistory()}</div>
      </div>
    );
  }

  if (showCalendar) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
        <div className="max-w-2xl mx-auto">{renderCalendar()}</div>
      </div>
    );
  }

  if (selectedDate) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
        <div className="max-w-2xl mx-auto">{renderHistoricalView()}</div>
      </div>
    );
  }

  // ===================== VISTA PRINCIPAL =====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-800">Calculadora Diaria</h1>
              <p className="text-gray-600">
                {new Date(currentDate + 'T00:00:00').toLocaleDateString('es-CO', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                })}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {isDayCompleted && (
                  <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm inline-flex items-center">
                    ✅ Día completado - Datos guardados
                  </span>
                )}
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
                  📅 Mes: {currentMonth}
                </span>
                {isLastDayOfMonth && (
                  <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold">
                    ⚠️ ¡ÚLTIMO DÍA DEL MES!
                  </span>
                )}
                {selectedDate && selectedDate !== currentDate && (
                  <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold">
                    📝 Registrando día pasado: {selectedDate}
                  </span>
                )}
              </div>
              <div className="mt-2 flex space-x-2">
                <span className={`text-sm px-3 py-1 rounded-full flex items-center ${
                  cloudStatus.includes('✅') ? 'bg-green-100 text-green-700' :
                  cloudStatus.includes('💾') ? 'bg-blue-100 text-blue-700' :
                  cloudStatus.includes('⚠️') ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'}`}>
                  <Cloud size={12} className="mr-1" />
                  {cloudStatus}
                </span>
                <button
                  onClick={() => exportToExcel('full')}
                  className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full hover:bg-green-200 transition-colors flex items-center space-x-1"
                >
                  <Download size={12} /><span>Exportar a Excel</span>
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowCalendar(true)}
              className="bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 transition-colors"
              title="Ver historial diario"
            >
              <Calendar size={24} />
            </button>
            <button
              onClick={() => setShowMonthlyHistory(true)}
              className="bg-purple-500 text-white p-3 rounded-lg hover:bg-purple-600 transition-colors ml-2"
              title="Ver historial de meses"
            >
              📊
            </button>
          </div>
        </div>

        {isLastDayOfMonth && !isDayCompleted && (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4 rounded-lg">
            <div className="flex">
              <span className="text-yellow-500 text-2xl">⚠️</span>
              <div className="ml-3">
                <h3 className="text-lg font-bold text-yellow-800">¡ÚLTIMO DÍA DEL MES!</h3>
                <ul className="mt-1 text-sm list-disc list-inside space-y-1 text-yellow-700">
                  <li>Los acumulados se reiniciarán a CERO el próximo mes</li>
                  <li>Podrás exportar el resumen del mes desde el historial</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
          <div className="flex space-x-2">
            {[
              { key: 'paso1', label: 'Paso 1', activeColor: 'bg-blue-500' },
              { key: 'paso2', label: 'Paso 2', activeColor: 'bg-green-500' },
              { key: 'resumen', label: 'Resumen', activeColor: 'bg-purple-500' }
            ].map(({ key, label, activeColor }) => (
              <button
                key={key}
                onClick={() => {
                  if (key === 'paso1' && (completedSteps.paso2 || isDayCompleted)) setCurrentView('paso1');
                  else if (key === 'paso2' && (completedSteps.paso1 || isDayCompleted)) setCurrentView('paso2');
                  else if (key === 'resumen' && (completedSteps.paso2 || isDayCompleted)) setCurrentView('resumen');
                  else if (key === 'paso1' && !completedSteps.paso1) setCurrentView('paso1');
                }}
                className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                  currentView === key
                    ? `${activeColor} text-white`
                    : (completedSteps.paso2 || isDayCompleted || (key === 'paso1'))
                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          {currentView === 'paso1' && (
            <div>
              <h2 className="text-2xl font-bold text-blue-900 mb-6">Paso 1</h2>

              {isDayCompleted && (
                <div className="bg-blue-100 border-l-4 border-blue-500 p-4 mb-4">
                  <p className="text-blue-800 font-semibold">ℹ️ Este día ya fue registrado. Los datos están en modo solo lectura.</p>
                </div>
              )}

              {todayData.paso1.totalDiaAnterior > 0 && !isDayCompleted && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
                  <p className="text-sm text-yellow-800">
                    📊 <strong>Total del día anterior: {formatCurrency(todayData.paso1.totalDiaAnterior)}</strong>
                  </p>
                </div>
              )}

              <div className="space-y-4">
                {isDayCompleted ? (
                  <div className="space-y-3">
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <p className="text-gray-700 font-semibold mb-1">Dato 1:</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {formatCurrency(historicalData[currentDate]?.paso1?.dato1 || todayData.paso1.dato1 || '0')}
                      </p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <p className="text-gray-700 font-semibold mb-1">Dato 2:</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {formatCurrency(historicalData[currentDate]?.paso1?.dato2 || todayData.paso1.dato2 || '0')}
                      </p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg space-y-1">
                      <p className="text-gray-700 font-semibold">Acumulado anterior: {formatCurrency(historicalData[currentDate]?.paso1?.acumuladoAnterior || todayData.paso1.acumuladoAnterior || 0)}</p>
                      <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(historicalData[currentDate]?.paso1?.total || todayData.paso1.total || 0)}</p>
                      <p className="text-blue-900 font-bold text-xl mt-2 pt-2 border-t border-blue-200">
                        Acumulado del mes: {formatCurrency(historicalData[currentDate]?.paso1?.acumulado || todayData.paso1.acumulado || 0)}
                      </p>
                    </div>
                    <div className="bg-blue-100 p-3 rounded-lg text-center text-blue-800 font-semibold">✓ Paso completado - Solo lectura</div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-2">Dato 1</label>
                      <input type="text"
                        value={formatCurrency(todayData.paso1.dato1)}
                        onChange={(e) => handleInputChange('paso1', 'dato1', e.target.value)}
                        disabled={completedSteps.paso1}
                        className={`w-full p-3 border-2 rounded-lg text-lg ${completedSteps.paso1 ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed' : 'border-blue-300 focus:border-blue-500 focus:outline-none'}`}
                        placeholder="$0"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-2">Dato 2</label>
                      <input type="text"
                        value={formatCurrency(todayData.paso1.dato2)}
                        onChange={(e) => handleInputChange('paso1', 'dato2', e.target.value)}
                        disabled={completedSteps.paso1}
                        className={`w-full p-3 border-2 rounded-lg text-lg ${completedSteps.paso1 ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed' : 'border-blue-300 focus:border-blue-500 focus:outline-none'}`}
                        placeholder="$0"
                      />
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg space-y-1">
                      <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(todayData.paso1.total)}</p>
                      <p className="text-blue-900 font-bold text-xl mt-2 pt-2 border-t border-blue-200">
                        Acumulado del mes: {formatCurrency(todayData.paso1.acumulado)}
                      </p>
                    </div>
                    {!completedSteps.paso1 && (
                      <button
                        onClick={continuarPaso1}
                        disabled={todayData.paso1.dato1 === '' || todayData.paso1.dato2 === ''}
                        className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${todayData.paso1.dato1 === '' || todayData.paso1.dato2 === '' ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
                      >
                        <span>Siguiente: Paso 2</span><ChevronRight size={20} />
                      </button>
                    )}
                    {completedSteps.paso1 && (
                      <div className="bg-blue-100 p-3 rounded-lg text-center text-blue-800 font-semibold">✓ Paso completado - Solo lectura</div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {currentView === 'paso2' && (
            <div>
              <h2 className="text-2xl font-bold text-green-900 mb-6">Paso 2</h2>

              {isDayCompleted && (
                <div className="bg-green-100 border-l-4 border-green-500 p-4 mb-4">
                  <p className="text-green-800 font-semibold">ℹ️ Este día ya fue registrado. Los datos están en modo solo lectura.</p>
                </div>
              )}

              {todayData.paso2.totalDiaAnterior > 0 && !isDayCompleted && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
                  <p className="text-sm text-yellow-800">
                    📊 <strong>Total del día anterior: {formatCurrency(todayData.paso2.totalDiaAnterior)}</strong>
                  </p>
                </div>
              )}

              <div className="space-y-4">
                {isDayCompleted ? (
                  <div className="space-y-3">
                    <div className="bg-white p-4 rounded-lg border border-green-200">
                      <p className="text-gray-700 font-semibold mb-1">Dato 1:</p>
                      <p className="text-2xl font-bold text-green-900">
                        {formatCurrency(historicalData[currentDate]?.paso2?.dato1 || todayData.paso2.dato1 || '0')}
                      </p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-green-200">
                      <p className="text-gray-700 font-semibold mb-1">Dato 2:</p>
                      <p className="text-2xl font-bold text-green-900">
                        {formatCurrency(historicalData[currentDate]?.paso2?.dato2 || todayData.paso2.dato2 || '0')}
                      </p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg space-y-1">
                      <p className="text-gray-700 font-semibold">Acumulado anterior: {formatCurrency(historicalData[currentDate]?.paso2?.acumuladoAnterior || todayData.paso2.acumuladoAnterior || 0)}</p>
                      <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(historicalData[currentDate]?.paso2?.total || todayData.paso2.total || 0)}</p>
                      <p className="text-green-900 font-bold text-xl mt-2 pt-2 border-t border-green-200">
                        Acumulado del mes: {formatCurrency(historicalData[currentDate]?.paso2?.acumulado || todayData.paso2.acumulado || 0)}
                      </p>
                    </div>
                    <div className="bg-green-100 p-3 rounded-lg text-center text-green-800 font-semibold">✓ Paso completado - Solo lectura</div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-2">Dato 1</label>
                      <input type="text"
                        value={formatCurrency(todayData.paso2.dato1)}
                        onChange={(e) => handleInputChange('paso2', 'dato1', e.target.value)}
                        disabled={completedSteps.paso2}
                        className={`w-full p-3 border-2 rounded-lg text-lg ${completedSteps.paso2 ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed' : 'border-green-300 focus:border-green-500 focus:outline-none'}`}
                        placeholder="$0"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-2">Dato 2</label>
                      <input type="text"
                        value={formatCurrency(todayData.paso2.dato2)}
                        onChange={(e) => handleInputChange('paso2', 'dato2', e.target.value)}
                        disabled={completedSteps.paso2}
                        className={`w-full p-3 border-2 rounded-lg text-lg ${completedSteps.paso2 ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed' : 'border-green-300 focus:border-green-500 focus:outline-none'}`}
                        placeholder="$0"
                      />
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg space-y-1">
                      <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(todayData.paso2.total)}</p>
                      <p className="text-green-900 font-bold text-xl mt-2 pt-2 border-t border-green-200">
                        Acumulado del mes: {formatCurrency(todayData.paso2.acumulado)}
                      </p>
                    </div>
                    {!completedSteps.paso2 && (
                      <button
                        onClick={continuarPaso2}
                        disabled={todayData.paso2.dato1 === '' || todayData.paso2.dato2 === ''}
                        className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${todayData.paso2.dato1 === '' || todayData.paso2.dato2 === '' ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-500 text-white hover:bg-green-600'}`}
                      >
                        <span>Ver Resumen</span><ChevronRight size={20} />
                      </button>
                    )}
                    {completedSteps.paso2 && (
                      <div className="bg-green-100 p-3 rounded-lg text-center text-green-800 font-semibold">✓ Paso completado - Solo lectura</div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {currentView === 'resumen' && (
            <div>
              <h2 className="text-2xl font-bold text-purple-900 mb-6">Resumen del Día</h2>

              {isDayCompleted && (
                <div className="bg-purple-100 border-l-4 border-purple-500 p-4 mb-4">
                  <p className="text-purple-800 font-semibold">✅ Este día ya fue guardado exitosamente.</p>
                  <p className="text-sm text-purple-700 mt-1">Datos sincronizados con la nube.</p>
                </div>
              )}

              <div className="space-y-4">
                {[
                  { key: 'paso1', label: 'Paso 1', color: 'blue' },
                  { key: 'paso2', label: 'Paso 2', color: 'green' }
                ].map(({ key, label, color }) => {
                  const src = isDayCompleted && historicalData[currentDate] ? historicalData[currentDate] : todayData;
                  return (
                    <div key={key} className={`bg-${color}-50 p-4 rounded-lg`}>
                      <h3 className={`font-bold text-${color}-900 mb-3 text-lg`}>{label}</h3>
                      <p className="text-gray-700">
                        Total del día: <span className="font-bold">{formatCurrency(src[key]?.total || 0)}</span>
                      </p>
                      <p className={`text-${color}-900 font-bold text-xl mt-2 pt-2 border-t border-${color}-200`}>
                        Acumulado del mes: {formatCurrency(src[key]?.acumulado || 0)}
                      </p>
                    </div>
                  );
                })}

                <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-200">
                  <h3 className="font-bold text-purple-900 text-lg mb-3">Total del Día</h3>
                  {(() => {
                    const src = isDayCompleted && historicalData[currentDate] ? historicalData[currentDate] : todayData;
                    const totalDia = (src.paso1?.total || 0) + (src.paso2?.total || 0);
                    const pct = isDayCompleted && historicalData[currentDate]
                      ? (historicalData[currentDate].porcentaje || 0)
                      : calculateDayPercentage();
                    return (
                      <>
                        <p className="font-bold text-3xl text-purple-900">{formatCurrency(totalDia)}</p>
                        <div className="border-t-2 border-purple-300 pt-3 mt-3">
                          <p className="font-bold text-purple-900 text-2xl">Porcentaje del día: {pct.toFixed(2)}%</p>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {!isDayCompleted && (
                  <button onClick={saveData}
                    className="w-full bg-purple-500 text-white py-3 rounded-lg font-semibold hover:bg-purple-600 transition-colors flex items-center justify-center space-x-2">
                    <Save size={20} /><span>Guardar Datos del Día</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-sm text-gray-500">
          <p>💡 <strong>Mes actual:</strong> {currentMonth} | ☁️ {cloudStatus}</p>
          <p>📊 Días registrados: {Object.keys(historicalData).length} | Meses: {Object.keys(monthlyData).length}</p>
        </div>
      </div>
    </div>
  );
};

export default App;