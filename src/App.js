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
  // Permite editar: cualquier día del mes actual, O el último día de un mes anterior
  const canEditDate = (dateStr) => {
    const mesDelaFecha = dateStr.slice(0, 7);
    if (mesDelaFecha === currentMonth) return true;
    if (mesDelaFecha < currentMonth && isLastDayOfItsMonth(dateStr)) return true;
    return false;
  };

  // ===================== FUNCIONES JSON =====================
  const exportAllDataToJSON = () => {
    try {
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

  // ===================== FUNCIÓN PARA EXPORTAR A EXCEL =====================
  const exportToExcel = (type = 'full') => {
    try {
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

        const dailyTitleRow = dailySheet.addRow(['DETALLE DIARIO COMPLETO']);
        dailyTitleRow.font = { bold: true, size: 14, color: { argb: '1F4E78' } };
        dailyTitleRow.alignment = { horizontal: 'center' };
        dailySheet.mergeCells('A1:L1');

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

        const sortedDates = Object.keys(historicalData).sort();

        sortedDates.forEach((date, index) => {
          const data = historicalData[date];
          const dateObj = new Date(date + 'T00:00:00');
          const dayOfWeek = dateObj.toLocaleDateString('es-CO', { weekday: 'long' });

          // ✅ FIX: usar los acumulados reales del día, no recalcularlos
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

          // ✅ VALIDAR: Asegurar que todos los números sean válidos antes de agregar
          const row = dailySheet.addRow([
            date,
            dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1),
            Math.max(0, parseFloat(data.paso1?.dato1 || 0)),
            Math.max(0, parseFloat(data.paso1?.dato2 || 0)),
            totalPaso1Dia,
            acumuladoPaso1,   // ✅ acumulado real
            Math.max(0, parseFloat(data.paso2?.dato1 || 0)),
            Math.max(0, parseFloat(data.paso2?.dato2 || 0)),
            totalPaso2Dia,
            acumuladoPaso2,   // ✅ acumulado real
            Math.min(100, Math.max(0, porcentajeDia / 100)),  // Asegurar 0-1 para porcentaje
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

        if (sortedDates.length > 0) {
          dailySheet.addRow([]);
          const totalsRow = dailySheet.addRow([
            'TOTALES', '',
            `=SUM(C3:C${sortedDates.length + 2})`,
            `=SUM(D3:D${sortedDates.length + 2})`,
            `=SUM(E3:E${sortedDates.length + 2})`, '',
            `=SUM(G3:G${sortedDates.length + 2})`,
            `=SUM(H3:H${sortedDates.length + 2})`,
            `=SUM(I3:I${sortedDates.length + 2})`, '', '',
            `=SUM(L3:L${sortedDates.length + 2})`
          ]);
          totalsRow.font = { bold: true };
          totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2CC' } };
          totalsRow.eachCell((cell) => {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          });
          [3, 4, 5, 7, 8, 9, 12].forEach(colIndex => {
            totalsRow.getCell(colIndex).numFmt = '#,##0';
          });
        }
      }

      if (type === 'full' || type === 'monthly') {
        if (Object.keys(monthlyData).length > 0) {
          const monthlySheet = workbook.addWorksheet('Resumen por Mes');
          [1,2,3,4,5,6].forEach((col, i) => {
            monthlySheet.getColumn(col).width = [20,15,20,20,20,15][i];
          });

          const monthlyTitleRow = monthlySheet.addRow(['RESUMEN POR MES']);
          monthlyTitleRow.font = { bold: true, size: 14, color: { argb: '1F4E78' } };
          monthlyTitleRow.alignment = { horizontal: 'center' };
          monthlySheet.mergeCells('A1:F1');

          const monthlyHeaders = monthlySheet.addRow(['Mes', 'Días', 'Total Paso 1', 'Total Paso 2', 'Total General', 'Porcentaje']);
          monthlyHeaders.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E75B6' } };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            cell.alignment = { horizontal: 'center' };
          });

          const months = Object.keys(monthlyData).sort();
          months.forEach((month, index) => {
            const data = monthlyData[month];
            const diasTotales = data.informacionConsolidada?.diasTotales || 0;
            const totalPaso1 = data.totalesPorDia?.paso1 || data.acumuladoGeneral?.paso1 || 0;
            const totalPaso2 = data.totalesPorDia?.paso2 || data.acumuladoGeneral?.paso2 || 0;
            const totalGeneral = data.totalesPorDia?.general || (totalPaso1 + totalPaso2);

            let porcentajeMes = data.porcentajeFinal || 0;
            if (porcentajeMes === 0 && totalPaso1 > 0 && totalPaso2 > 0) {
              const menor = Math.min(totalPaso1, totalPaso2);
              const mayor = Math.max(totalPaso1, totalPaso2);
              porcentajeMes = (menor / mayor) * 100;
            }

            const row = monthlySheet.addRow([month, diasTotales, totalPaso1, totalPaso2, totalGeneral, porcentajeMes / 100]);
            if (index % 2 === 0) {
              row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F2F2F2' } }; });
            }
            row.eachCell((cell) => {
              cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
            [3, 4, 5].forEach(colIndex => { row.getCell(colIndex).numFmt = '#,##0'; });
            row.getCell(6).numFmt = '0.00%';
          });

          if (months.length > 0) {
            monthlySheet.addRow([]);
            const totalsRow = monthlySheet.addRow([
              'TOTALES',
              `=SUM(B3:B${months.length + 2})`,
              `=SUM(C3:C${months.length + 2})`,
              `=SUM(D3:D${months.length + 2})`,
              `=SUM(E3:E${months.length + 2})`,
              ''
            ]);
            totalsRow.font = { bold: true, color: { argb: 'FFFFFF' } };
            totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C00000' } };
            totalsRow.eachCell((cell) => {
              cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
            [3, 4, 5].forEach(colIndex => { totalsRow.getCell(colIndex).numFmt = '#,##0'; });
          }
        } else if (type === 'monthly') {
          alert("No hay datos mensuales para exportar.");
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

        // ✅ FIX: guardar el resumen del mes anterior antes de cambiar
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
          
          // 🔧 CORRECCIÓN AUTOMÁTICA: Si marzo está mal, corregir automáticamente
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
  }, [currentDate]);

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
        // ✅ Validar que los datos sean correctos
        if (data && data.paso1 && data.paso2) {
          historical[doc.id] = data;
        }
      });

      const monthlyRef = collection(db, 'users', userId, 'monthlyData');
      const monthlySnapshot = await getDocs(monthlyRef);
      const monthly = {};
      monthlySnapshot.forEach(doc => { 
        const data = doc.data();
        // ✅ Validar que los datos sean correctos
        if (data && data.acumuladoGeneral) {
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
  // ✅ FIX: recibe el snapshot de historicalData para no depender del estado (puede ser stale)
  const saveMonthSummary = async (monthKey, historicalSnapshot = null) => {
    console.log(`📊 saveMonthSummary llamado para: ${monthKey}`);
    // Usar la función robusta que ya existe
    return await consolidarMesRobusto(monthKey);
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

  // ✅ CONSOLIDAR TODOS - Mejorado
  // ✅ FUNCIÓN ROBUSTA: Consolidar y guardar mes sin depender del estado
  const consolidarMesRobusto = async (monthKey) => {
    console.log(`🔨 Consolidando mes ${monthKey} de forma robusta...`);
    try {
      // Obtener datos históricos que coincidan con el mes
      const diasDelMes = Object.entries(historicalData)
        .filter(([date]) => date.startsWith(monthKey))
        .sort((a, b) => a[0].localeCompare(b[0]));

      if (diasDelMes.length === 0) {
        console.warn(`⚠️ No hay días registrados para ${monthKey}`);
        alert(`❌ No hay datos histó para consolidar el mes ${monthKey}`);
        return false;
      }

      console.log(`📊 Encontrados ${diasDelMes.length} días para ${monthKey}`);

      // Construir resumen - RECALCULANDO los acumulados (no copiando datos corruptos)
      let totalDiarioPaso1 = 0;
      let totalDiarioPaso2 = 0;
      const diasRegistrados = [];

      diasDelMes.forEach(([date, data]) => {
        const totalP1 = Math.max(0, parseFloat(data.paso1?.total) || 0);
        const totalP2 = Math.max(0, parseFloat(data.paso2?.total) || 0);
        totalDiarioPaso1 += totalP1;
        totalDiarioPaso2 += totalP2;

        // 🔥 CRÍTICO: Usar los totales acumulados a medida que iteramos, NO copiar los datos viejos
        diasRegistrados.push({
          fecha: date,
          paso1: {
            totalDia: totalP1,
            acumuladoHastaDia: totalDiarioPaso1  // ← RECALCULADO, no copiado
          },
          paso2: {
            totalDia: totalP2,
            acumuladoHastaDia: totalDiarioPaso2  // ← RECALCULADO, no copiado
          },
          porcentajeDia: data.porcentaje || 0
        });
      });

      // Los acumulados finales son los últimos valores calculados
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
        }
      };

      console.log(`✅ Resumen construido para ${monthKey}:`, summary);

      // 1. Guardar localmente PRIMERO
      setMonthlyData(prev => {
        const nuevo = { ...prev, [monthKey]: summary };
        console.log(`🔄 monthlyData actualizado localmente. Total meses: ${Object.keys(nuevo).length}`);
        return nuevo;
      });

      // 2. Guardar en Firebase
      if (user) {
        const guardoExitoso = await saveToFirebase('monthlyData', monthKey, summary);
        if (guardoExitoso) {
          console.log(`✅ Mes ${monthKey} guardado en Firebase - ¡LISTO!`);
          setCloudStatus(`✅ Mes ${monthKey} consolidado en la nube`);
          return true;
        } else {
          console.warn(`⚠️ No se guardó en Firebase pero está localmente`);
          return true; // Seguir considerándolo exitoso localmente
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

      // Verificar si hubo cambios
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

    // Guardar datos corregidos
    console.log(`💾 Guardando ${Object.keys(datosCorregidos).length} días corregidos...`);
    for (const [fecha, datos] of Object.entries(datosCorregidos)) {
      await saveToFirebase('historicalData', fecha, datos);
    }

    // Actualizar estado local
    setHistoricalData(prev => ({ ...prev, ...datosCorregidos }));
    setCloudStatus(`✅ Mes ${monthKey} corregido`);

    // 🔥 CRÍTICO: Re-consolidar el mes con los datos ya corregidos
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
      await new Promise(resolve => setTimeout(resolve, 500)); // Esperar entre consolidaciones
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

      // ✅ FIX: nombres distintos para evitar shadowing de variable
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

        // ✅ FIX: actualizar diasDelMes en memoria para que el siguiente ciclo use el valor corregido
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
    } else if (mesDeLaFecha < currentMonth) {
      alert(`❌ No puedes registrar datos en meses anteriores.\n\nEl día ${date} pertenece al mes ${mesDeLaFecha}.`);
    } else {
      if (window.confirm(`¿Quieres registrar datos para el día ${date}?`)) {
        setupDateForRegistration(date);
      }
    }
  };

  const setupDateForRegistration = (date) => {
    const selectedMonth = date.slice(0, 7);

    if (selectedMonth < currentMonth) {
      alert(`❌ No puedes registrar datos en meses anteriores.\n\nLa fecha ${date} pertenece a un mes pasado (${selectedMonth}).`);
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

      console.log('💾 Guardando datos para el día:', saveDate);

      if (new Date(saveDate) > new Date()) {
        alert('❌ No puedes registrar datos para días futuros.');
        return;
      }

      // ✅ FIX: ya NO bloqueamos el último día de un mes anterior
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

      // 🔧 CRITICAL FIX: SIEMPRE recalcular TODOS los acumulados del mes, sin excepción
      // Removida la condición if (saveDate !== currentDate) porque causaba que marzo no se recalculara
      const diasOrdenados = Object.entries(nuevosHistoricalData)
        .filter(([date]) => date.startsWith(mesDelDia))
        .sort((a, b) => a[0].localeCompare(b[0]));

      for (let i = 0; i < diasOrdenados.length; i++) {
        const fecha = diasOrdenados[i][0];
        let datos = { ...diasOrdenados[i][1] };
        
        // Asegurar que paso1 y paso2 sean objetos válidos
        if (!datos.paso1) datos.paso1 = {};
        if (!datos.paso2) datos.paso2 = {};
        
        // Recalcular totales del día
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

      // ✅ MEJORADO: consolidar mes si es el último día (sin importar si es mes actual o anterior)
      if (isLastDayOfItsMonth(saveDate)) {
        console.log(`✅ Consolidando mes ${mesDelDia} porque se guardó su último día`);
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
    // ✅ FIX: usar canEditDate que permite editar el último día de mes anterior
    if (!canEditDate(date)) {
      alert(`❌ No puedes editar datos de este día.\n\nSolo se puede editar el mes actual o el último día de meses anteriores.\n\nEl día ${date} no cumple ninguna condición.`);
      return;
    }
    setEditData({ ...dataToEdit });
    setIsEditing(true);
  };

  const saveEdit = async () => {
    try {
      let newHistoricalData = { ...historicalData, [editData.date]: { ...editData } };

      // Si el día editado pertenece a un mes, recalcular acumulados del mes
      const mesDelDia = editData.date.slice(0, 7);
      const diasOrdenados = Object.entries(newHistoricalData)
        .filter(([date]) => date.startsWith(mesDelDia))
        .sort((a, b) => a[0].localeCompare(b[0]));

      // ✅ MEJORADO: recalcular acumulados correctamente
      for (let i = 0; i < diasOrdenados.length; i++) {
        const fecha = diasOrdenados[i][0];
        let datos = { ...diasOrdenados[i][1] };
        
        // Asegurar que paso1 y paso2 sean objetos válidos
        if (!datos.paso1) datos.paso1 = {};
        if (!datos.paso2) datos.paso2 = {};
        
        // Recalcular totales del día
        const totalDiaPaso1 = parseFloat(datos.paso1.dato1 || 0) + parseFloat(datos.paso1.dato2 || 0);
        const totalDiaPaso2 = parseFloat(datos.paso2.dato1 || 0) + parseFloat(datos.paso2.dato2 || 0);
        datos.paso1.total = totalDiaPaso1;
        datos.paso2.total = totalDiaPaso2;
        
        if (i === 0) {
          // Primer día del mes
          datos.paso1.acumuladoAnterior = 0;
          datos.paso1.acumulado = totalDiaPaso1;
          datos.paso2.acumuladoAnterior = 0;
          datos.paso2.acumulado = totalDiaPaso2;
        } else {
          // Días posteriores: tomar acumulado del día anterior
          const datosAnterior = newHistoricalData[diasOrdenados[i-1][0]];
          datos.paso1.acumuladoAnterior = datosAnterior.paso1?.acumulado || 0;
          datos.paso1.acumulado = (datosAnterior.paso1?.acumulado || 0) + totalDiaPaso1;
          datos.paso2.acumuladoAnterior = datosAnterior.paso2?.acumulado || 0;
          datos.paso2.acumulado = (datosAnterior.paso2?.acumulado || 0) + totalDiaPaso2;
        }
        
        // Recalcular porcentaje
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
        // Guardar todos los días del mes en Firebase
        for (const [fecha, datos] of Object.entries(newHistoricalData).filter(([date]) => date.startsWith(mesDelDia))) {
          await saveToFirebase('historicalData', fecha, datos);
        }
        setCloudStatus('💾 Cambios guardados en la nube');
      }

      // ✅ MEJORADO: consolidar mes si es el último día DE CUALQUIER MES (actual o anterior)
      if (isLastDayOfItsMonth(editData.date)) {
        console.log(`✅ Consolidando mes ${mesDelDia} porque se editó su último día`);
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
      days.push({ day, date: dateString, hasData, isToday, isFutureDate, esMesAnterior, esUltimoDiaMes });
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

            const { day, date, hasData, isToday, isFutureDate, esMesAnterior, esUltimoDiaMes } = dayInfo;
            const isSelectable = !isFutureDate && (!esMesAnterior || hasData || esUltimoDiaMes);

            let bgColor = 'bg-gray-100';
            let textColor = 'text-gray-700';
            let hoverColor = 'hover:bg-gray-200';
            let cursor = isSelectable ? 'cursor-pointer' : 'cursor-not-allowed';
            let titleText = 'Registrar día';

            if (hasData) {
              if (esMesAnterior) {
                // ✅ FIX: si es el último día del mes anterior, usar color diferente (editable)
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
                {hasData && (
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
    // ✅ FIX: mostrar TODOS los meses menos el actual (incluyendo meses anteriores recién consolidados)
    const months = Object.entries(monthlyData)
      .filter(([monthKey]) => monthKey !== currentMonth)
      .sort((a, b) => b[0].localeCompare(a[0]));

    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">📊 Historial de Meses Completados</h2>
          <button onClick={() => setShowMonthlyHistory(false)} className="text-gray-500 hover:text-gray-700 text-2xl">✕</button>
        </div>

        {/* ✅ NUEVO: botón para consolidar manualmente un mes que no aparece */}
        <div className="mb-4 bg-yellow-50 border border-yellow-300 rounded-lg p-3 text-sm text-yellow-800">
          <p className="font-semibold">¿No ves un mes en la lista?</p>
          <p className="mt-1">Puedes consolidarlo manualmente si ya terminó:</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {/* Mostrar los últimos 3 meses anteriores que tengan datos pero no resumen */}
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
            <p className="text-gray-500 mb-4">No hay meses completados aún</p>
            <p className="text-sm text-gray-600">
              El mes actual ({currentMonth}) no aparece aquí. Usa el botón de arriba para consolidar un mes pasado.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {months.map(([monthKey, data]) => {
              if (!data) return null;
              const diasTotales = data.informacionConsolidada?.diasTotales || 0;
              const totalPaso1 = data.totalesPorDia?.paso1 || data.acumuladoGeneral?.paso1 || 0;
              const totalPaso2 = data.totalesPorDia?.paso2 || data.acumuladoGeneral?.paso2 || 0;
              const totalGeneral = data.totalesPorDia?.general || (totalPaso1 + totalPaso2);
              const porcentaje = data.porcentajeFinal || 0;

              return (
                <div key={monthKey} className="border rounded-lg p-4 bg-gradient-to-r from-blue-50 to-purple-50">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-lg">{monthKey}</h3>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => corregirDatosDelMes(monthKey)}
                        className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full hover:bg-red-200 transition-colors"
                        title="Recalcular acumulados de este mes"
                      >
                        🔧 Corregir
                      </button>
                      <button
                        onClick={() => consolidarMesManual(monthKey)}
                        className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full hover:bg-yellow-200 transition-colors"
                        title="Re-consolidar este mes"
                      >
                        🔄
                      </button>
                      <button
                        onClick={() => exportMonthToExcel(monthKey)}
                        className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full hover:bg-purple-200 transition-colors"
                      >
                        Exportar mes
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                    <div><p className="text-gray-600">Días registrados:</p><p className="font-bold text-lg">{diasTotales}</p></div>
                    <div><p className="text-gray-600">Total Paso 1:</p><p className="font-bold text-blue-900">{formatCurrency(totalPaso1)}</p></div>
                    <div><p className="text-gray-600">Total Paso 2:</p><p className="font-bold text-green-900">{formatCurrency(totalPaso2)}</p></div>
                    <div><p className="text-gray-600">Total General:</p><p className="font-bold text-purple-900 text-lg">{formatCurrency(totalGeneral)}</p></div>
                  </div>

                  <div className="border-t pt-3 mt-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><p className="text-gray-600">Acumulado Paso 1:</p><p className="font-bold text-blue-900">{formatCurrency(data.acumuladoGeneral?.paso1 || totalPaso1)}</p></div>
                      <div><p className="text-gray-600">Acumulado Paso 2:</p><p className="font-bold text-green-900">{formatCurrency(data.acumuladoGeneral?.paso2 || totalPaso2)}</p></div>
                    </div>
                    <div className="mt-3 text-center">
                      <p className="text-gray-600">Porcentaje final:</p>
                      <p className="font-bold text-2xl text-purple-900">{porcentaje.toFixed(2)}%</p>
                    </div>
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
                <Download size={20} /><span>EXPORTAR DETALLE DIARIO</span>
              </button>
              <button
                onClick={exportAllDataToJSON}
                className="w-full bg-gray-700 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2"
              >
                <Download size={20} /><span>EXPORTAR BACKUP (JSON)</span>
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
    // ✅ FIX: el último día del mes anterior es editable, no "solo porcentaje"
    const esMesAnteriorSoloLectura = mesDeLaFecha < currentMonth && !isLastDayOfItsMonth(selectedDate);
    const esMesAnteriorEditable = mesDeLaFecha < currentMonth && isLastDayOfItsMonth(selectedDate);
    const esNuevoDia = !data && !editData;

    // NUEVO DÍA (sin datos)
    if (esNuevoDia) {
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

    // MES ANTERIOR SOLO LECTURA (no es último día)
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

    // ✅ FIX: MES ANTERIOR EDITABLE (último día del mes) O MES ACTUAL
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
    const puedeEditar = canEditDate(selectedDate);

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