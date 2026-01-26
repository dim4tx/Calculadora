import React, { useState, useEffect } from 'react';
import { Calendar, Save, ChevronRight, ChevronLeft, Edit2, X, Check, CalendarDays } from 'lucide-react';

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
  
  // 🧪 MODO PRUEBA: Fecha simulada
  const [simulatedDate, setSimulatedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Estado para datos del día actual
  const [todayData, setTodayData] = useState({
    date: simulatedDate,
    paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
    paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
    porcentaje: 0
  });

  // Datos históricos
  const [historicalData, setHistoricalData] = useState({});
  
  // Datos mensuales (resumen de cada mes)
  const [monthlyData, setMonthlyData] = useState({});

  // Detectar cambio de mes y resetear
  useEffect(() => {
    const checkMonthChange = () => {
      const currentMonth = new Date().toISOString().slice(0, 7); // "2025-01"
      const savedMonth = localStorage.getItem('currentMonth');
      
      if (savedMonth && savedMonth !== currentMonth) {
        // ¡Cambió el mes! Guardar resumen y resetear
        saveMonthSummary(savedMonth);
        alert(`📅 Nuevo mes detectado. Los datos de ${savedMonth} se han guardado y los acumulados se han reseteado.`);
      }
      
      localStorage.setItem('currentMonth', currentMonth);
    };
    
    checkMonthChange();
  }, []);

  // Guardar resumen del mes con JSON consolidado
  const saveMonthSummary = (monthKey) => {
    const monthDays = Object.entries(historicalData).filter(([date]) => 
      date.startsWith(monthKey)
    );
    
    if (monthDays.length === 0) return;
    
    let totalDiarioPaso1 = 0;
    let totalDiarioPaso2 = 0;
    let acumuladoFinalPaso1 = 0;
    let acumuladoFinalPaso2 = 0;
    const diasRegistrados = [];
    
    monthDays.forEach(([date, data]) => {
      totalDiarioPaso1 += data.paso1.total;
      totalDiarioPaso2 += data.paso2.total;
      acumuladoFinalPaso1 += data.paso1.total;
      acumuladoFinalPaso2 += data.paso2.total;
      
      diasRegistrados.push({
        fecha: date,
        paso1: {
          dato1: parseFloat(data.paso1.dato1) || 0,
          dato2: parseFloat(data.paso1.dato2) || 0,
          totalDia: data.paso1.total,
          acumuladoHastaDia: data.paso1.acumulado
        },
        paso2: {
          dato1: parseFloat(data.paso2.dato1) || 0,
          dato2: parseFloat(data.paso2.dato2) || 0,
          totalDia: data.paso2.total,
          acumuladoHastaDia: data.paso2.acumulado
        },
        porcentajeDia: data.porcentaje
      });
    });
    
    const totalGeneralDiario = totalDiarioPaso1 + totalDiarioPaso2;
    const totalGeneralAcumulado = acumuladoFinalPaso1 + acumuladoFinalPaso2;
    const porcentajeFinal = acumuladoFinalPaso1 > 0 && acumuladoFinalPaso2 > 0 
      ? (Math.min(acumuladoFinalPaso1, acumuladoFinalPaso2) / Math.max(acumuladoFinalPaso1, acumuladoFinalPaso2)) * 100 
      : 0;
    
    // JSON consolidado
    const summary = {
      mes: monthKey,
      diasRegistrados: diasRegistrados.sort((a, b) => a.fecha.localeCompare(b.fecha)),
      totalesPorDia: {
        paso1: totalDiarioPaso1,
        paso2: totalDiarioPaso2,
        general: totalGeneralDiario
      },
      acumuladoGeneral: {
        paso1: acumuladoFinalPaso1,
        paso2: acumuladoFinalPaso2,
        total: totalGeneralAcumulado
      },
      porcentajeFinal: parseFloat(porcentajeFinal.toFixed(2)),
      fechaConsolidacion: new Date().toISOString(),
      informacionConsolidada: {
        diasTotales: monthDays.length,
        primerDia: monthDays[0][0],
        ultimoDia: monthDays[monthDays.length - 1][0]
      }
    };
    
    setMonthlyData(prev => ({
      ...prev,
      [monthKey]: summary
    }));
    
    // Guardar en localStorage
    const savedMonths = JSON.parse(localStorage.getItem('monthlyData') || '{}');
    savedMonths[monthKey] = summary;
    localStorage.setItem('monthlyData', JSON.stringify(savedMonths));
    
    // Mostrar JSON consolidado en consola
    console.log('📊 JSON CONSOLIDADO DEL MES:');
    console.log(JSON.stringify(summary, null, 2));
    
    // Mostrar alerta con resumen
    alert(`📅 ¡Mes ${monthKey} completado!\n\nJSON consolidado generado con:\n- ${summary.informacionConsolidada.diasTotales} días registrados\n- Total Paso 1: ${formatCurrency(totalDiarioPaso1)}\n- Total Paso 2: ${formatCurrency(totalDiarioPaso2)}\n- Porcentaje final: ${porcentajeFinal.toFixed(2)}%\n\nRevisa la consola del navegador para ver el JSON completo.`);
    
    // Limpiar datos del mes anterior
    const newHistorical = {};
    Object.entries(historicalData).forEach(([date, data]) => {
      if (!date.startsWith(monthKey)) {
        newHistorical[date] = data;
      }
    });
    setHistoricalData(newHistorical);
  };

  // Función para obtener el día anterior
  const getPreviousDay = (dateString) => {
    const date = new Date(dateString + 'T00:00:00');
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  };

  // Función para obtener el día siguiente
  const getNextDay = (dateString) => {
    const date = new Date(dateString + 'T00:00:00');
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  };

  // Cargar datos mensuales guardados al iniciar
  useEffect(() => {
    const savedMonths = JSON.parse(localStorage.getItem('monthlyData') || '{}');
    setMonthlyData(savedMonths);
  }, []);

  // Cargar datos del día anterior cuando cambia la fecha simulada
  useEffect(() => {
    loadPreviousDayData();
  }, [simulatedDate, historicalData]);

  // Cargar datos del día anterior
  const loadPreviousDayData = () => {
    const yesterday = getPreviousDay(simulatedDate);

    if (historicalData[yesterday]) {
      const prevData = historicalData[yesterday];

      setTodayData(prev => ({
        ...prev,
        date: simulatedDate,
        paso1: {
          dato1: '',
          dato2: '',
          total: 0,
          acumuladoAnterior: prevData.paso1.acumulado,
          acumulado: prevData.paso1.acumulado
        },
        paso2: {
          dato1: '',
          dato2: '',
          total: 0,
          acumuladoAnterior: prevData.paso2.acumulado,
          acumulado: prevData.paso2.acumulado
        },
        porcentaje: 0
      }));
    } else {
      // No hay día anterior, empezar desde cero
      setTodayData(prev => ({
        ...prev,
        date: simulatedDate,
        paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
        paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
        porcentaje: 0
      }));
    }

    setCompletedSteps({ paso1: false, paso2: false });
    setCurrentView('paso1');
  };

  // Función para formatear números como moneda
  const formatCurrency = (value) => {
    const num = parseFloat(value) || 0;
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  // Función para parsear moneda a número
  const parseCurrency = (value) => {
    return value.replace(/[^0-9]/g, '');
  };

  // Manejar cambios en los inputs
  const handleInputChange = (paso, field, value) => {
    const numValue = parseCurrency(value);

    setTodayData(prev => {
      const newData = { ...prev };
      newData[paso][field] = numValue;

      const dato1 = parseFloat(newData[paso].dato1) || 0;
      const dato2 = parseFloat(newData[paso].dato2) || 0;

      newData[paso].total = dato1 + dato2;
      
      // Acumulado = acumulado anterior + total del día
      newData[paso].acumulado = newData[paso].acumuladoAnterior + newData[paso].total;

      return newData;
    });
  };

  // Continuar Paso 1
  const continuarPaso1 = () => {
    const { dato1, dato2 } = todayData.paso1;

    if (dato1 === '' || dato2 === '' || (parseFloat(dato1) === 0 && parseFloat(dato2) === 0)) {
      alert('⚠️ Debes ingresar al menos un valor diferente de cero en el Paso 1');
      return;
    }

    setCompletedSteps(prev => ({ ...prev, paso1: true }));
    setCurrentView('paso2');
  };

  // Continuar Paso 2
  const continuarPaso2 = () => {
    const { dato1, dato2 } = todayData.paso2;

    if (dato1 === '' || dato2 === '' || (parseFloat(dato1) === 0 && parseFloat(dato2) === 0)) {
      alert('⚠️ Debes ingresar al menos un valor diferente de cero en el Paso 2');
      return;
    }

    setCompletedSteps(prev => ({ ...prev, paso2: true }));
    setCurrentView('resumen');
  };

  // Manejar cambios en modo edición
  const handleEditInputChange = (paso, field, value) => {
    const numValue = parseCurrency(value);
    
    setEditData(prev => {
      const newData = { ...prev };
      newData[paso][field] = numValue;
      
      const dato1 = parseFloat(newData[paso].dato1) || 0;
      const dato2 = parseFloat(newData[paso].dato2) || 0;
      newData[paso].total = dato1 + dato2;
      newData[paso].acumulado = newData[paso].acumuladoAnterior + newData[paso].total;
      
      // Recalcular porcentaje
      const acum1 = newData.paso1.acumulado;
      const acum2 = newData.paso2.acumulado;
      if (acum1 > 0 && acum2 > 0) {
        const menor = Math.min(acum1, acum2);
        const mayor = Math.max(acum1, acum2);
        newData.porcentaje = (menor / mayor) * 100;
      }
      
      return newData;
    });
  };

  // Calcular porcentaje
  useEffect(() => {
    const acum1 = todayData.paso1.acumulado;
    const acum2 = todayData.paso2.acumulado;
    
    if (acum1 > 0 && acum2 > 0) {
      const menor = Math.min(acum1, acum2);
      const mayor = Math.max(acum1, acum2);
      setTodayData(prev => ({
        ...prev,
        porcentaje: (menor / mayor) * 100
      }));
    }
  }, [todayData.paso1.acumulado, todayData.paso2.acumulado]);

  // Guardar datos del día
  const saveData = () => {
    setHistoricalData(prev => ({
      ...prev,
      [todayData.date]: { ...todayData }
    }));

    const nextDate = getNextDay(todayData.date);
    setSimulatedDate(nextDate);

    setTodayData({
      date: nextDate,
      paso1: {
        dato1: '',
        dato2: '',
        total: 0,
        acumuladoAnterior: todayData.paso1.acumulado,
        acumulado: todayData.paso1.acumulado
      },
      paso2: {
        dato1: '',
        dato2: '',
        total: 0,
        acumuladoAnterior: todayData.paso2.acumulado,
        acumulado: todayData.paso2.acumulado
      },
      porcentaje: todayData.porcentaje
    });

    setCurrentView('paso1');
    setCompletedSteps({ paso1: false, paso2: false });

    alert('✅ Día guardado. Continúas con el día siguiente.');
  };

  // Cambiar fecha simulada
  const changeSimulatedDate = (newDate) => {
    setSimulatedDate(newDate);
    setShowDatePicker(false);
  };

  // Iniciar edición
  const startEditing = (date) => {
    const dataToEdit = historicalData[date];
    setEditData({ ...dataToEdit });
    setIsEditing(true);
  };

  // Guardar cambios de edición
  const saveEdit = () => {
    setHistoricalData(prev => ({
      ...prev,
      [editData.date]: { ...editData }
    }));

    setSelectedDate(null);
    setIsEditing(false);
    setEditData(null);
    setCurrentView('paso1');
    setCompletedSteps({ paso1: false, paso2: false });

    alert('✅ Cambios guardados. Regresaste al día actual.');
  };

  // Cancelar edición
  const cancelEdit = () => {
    setIsEditing(false);
    setEditData(null);
  };

  // Ver datos históricos
  const viewHistoricalData = (date) => {
    setSelectedDate(date);
    setShowCalendar(false);
  };

  // Generar días del mes para el calendario
  const generateCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      const dateString = date.toISOString().split('T')[0];
      const hasData = historicalData.hasOwnProperty(dateString);
      const isSimulated = dateString === simulatedDate;
      
      days.push({
        day,
        date: dateString,
        hasData,
        isSimulated
      });
    }
    
    return days;
  };

  // Cambiar mes del calendario
  const changeMonth = (increment) => {
    setCalendarMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + increment);
      return newDate;
    });
  };

  // Renderizar historial mensual
  const renderMonthlyHistory = () => {
    const months = Object.entries(monthlyData).sort((a, b) => b[0].localeCompare(a[0]));
    
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">📊 Historial de Meses</h2>
          <button
            onClick={() => setShowMonthlyHistory(false)}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ✕
          </button>
        </div>
        
        {months.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No hay meses completados aún</p>
        ) : (
          <div className="space-y-6">
            {months.map(([monthKey, data]) => (
              <div key={monthKey} className="border rounded-lg p-4 bg-gradient-to-r from-blue-50 to-purple-50">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-lg text-purple-900">
                    {new Date(monthKey + '-01').toLocaleDateString('es-CO', { 
                      month: 'long', 
                      year: 'numeric' 
                    })}
                  </h3>
                  <button
                    onClick={() => {
                      console.log(`📊 JSON del mes ${monthKey}:`);
                      console.log(JSON.stringify(data, null, 2));
                      alert(`JSON del mes ${monthKey} copiado a consola`);
                    }}
                    className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full hover:bg-purple-200 transition-colors"
                  >
                    Ver JSON
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                  <div>
                    <p className="text-gray-600">Días registrados:</p>
                    <p className="font-bold text-lg">{data.informacionConsolidada.diasTotales}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Total Paso 1:</p>
                    <p className="font-bold text-blue-900">{formatCurrency(data.totalesPorDia.paso1)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Total Paso 2:</p>
                    <p className="font-bold text-green-900">{formatCurrency(data.totalesPorDia.paso2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Total General:</p>
                    <p className="font-bold text-purple-900 text-lg">{formatCurrency(data.totalesPorDia.general)}</p>
                  </div>
                </div>
                
                <div className="border-t pt-3 mt-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Acumulado Paso 1:</p>
                      <p className="font-bold text-blue-900">{formatCurrency(data.acumuladoGeneral.paso1)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Acumulado Paso 2:</p>
                      <p className="font-bold text-green-900">{formatCurrency(data.acumuladoGeneral.paso2)}</p>
                    </div>
                  </div>
                  <div className="mt-3 text-center">
                    <p className="text-gray-600">Porcentaje final:</p>
                    <p className="font-bold text-2xl text-purple-900">{data.porcentajeFinal}%</p>
                  </div>
                </div>
                
                <div className="mt-4 text-xs text-gray-500">
                  <p>📅 {new Date(data.fechaConsolidacion).toLocaleDateString('es-CO', { 
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        
        <div className="mt-6 text-sm text-gray-500">
          <p>💡 Cada mes se genera un JSON con:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Mes y días registrados</li>
            <li>Totales por día de cada paso</li>
            <li>Acumulado general del mes</li>
            <li>Porcentaje final comparativo</li>
          </ul>
          <p className="mt-3">💾 Próximamente estos datos se guardarán en Firebase</p>
        </div>
      </div>
    );
  };

  const renderDatePicker = () => {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
          <h3 className="text-xl font-bold text-gray-800 mb-4">🧪 Modo Prueba: Cambiar Fecha</h3>
          <p className="text-sm text-gray-600 mb-4">
            Selecciona una fecha para simular y hacer pruebas de acumulados
          </p>
          
          <input
            type="date"
            value={simulatedDate}
            onChange={(e) => changeSimulatedDate(e.target.value)}
            className="w-full p-3 border-2 border-blue-300 rounded-lg text-lg focus:border-blue-500 focus:outline-none mb-4"
          />
          
          <div className="bg-blue-50 p-3 rounded-lg mb-4">
            <p className="text-sm text-blue-800">
              <strong>📅 Fecha seleccionada:</strong><br/>
              {new Date(simulatedDate + 'T00:00:00').toLocaleDateString('es-CO', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>
          
          <button
            onClick={() => setShowDatePicker(false)}
            className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors"
          >
            Confirmar
          </button>
        </div>
      </div>
    );
  };

  // Renderizar calendario
  const renderCalendar = () => {
    const days = generateCalendarDays();
    const monthName = calendarMonth.toLocaleDateString('es-CO', { 
      month: 'long', 
      year: 'numeric' 
    });
    const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Historial</h2>
          <button
            onClick={() => setShowCalendar(false)}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ✕
          </button>
        </div>
        
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => changeMonth(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft size={24} />
          </button>
          <h3 className="text-xl font-semibold capitalize">{monthName}</h3>
          <button
            onClick={() => changeMonth(1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {weekDays.map(day => (
            <div key={day} className="text-center font-semibold text-gray-600 text-sm">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((dayInfo, index) => {
            if (!dayInfo) {
              return <div key={`empty-${index}`} className="aspect-square"></div>;
            }

            const { day, date, hasData, isSimulated } = dayInfo;

            return (
              <button
                key={date}
                onClick={() => hasData ? viewHistoricalData(date) : null}
                disabled={!hasData}
                className={`
                  aspect-square p-2 rounded-lg font-semibold transition-all
                  ${hasData 
                    ? 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer' 
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }
                  ${isSimulated ? 'ring-2 ring-orange-500' : ''}
                `}
              >
                {day}
              </button>
            );
          })}
        </div>

        <div className="mt-4 text-sm text-gray-600 space-y-1">
          <p>• <span className="text-blue-500 font-semibold">Azul</span>: Días con datos guardados</p>
          <p>• <span className="text-gray-400 font-semibold">Gris</span>: Días sin datos</p>
          <p>• <span className="text-orange-500 font-semibold">Borde naranja</span>: Fecha simulada actual</p>
        </div>
      </div>
    );
  };

  // Renderizar vista histórica
  const renderHistoricalView = () => {
    const data = editData || historicalData[selectedDate];
    
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-CO', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </h2>
          <button
            onClick={() => {
              setSelectedDate(null);
              setIsEditing(false);
              setEditData(null);
            }}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {/* Paso 1 */}
          <div className="border rounded-lg p-4 bg-blue-50">
            <h3 className="font-bold text-lg mb-3 text-blue-900">Paso 1</h3>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 1</label>
                  <input
                    type="text"
                    value={formatCurrency(data.paso1.dato1)}
                    onChange={(e) => handleEditInputChange('paso1', 'dato1', e.target.value)}
                    className="w-full p-2 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 2</label>
                  <input
                    type="text"
                    value={formatCurrency(data.paso1.dato2)}
                    onChange={(e) => handleEditInputChange('paso1', 'dato2', e.target.value)}
                    className="w-full p-2 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="pt-2 border-t border-blue-200">
                  <p className="text-sm text-gray-600">Acumulado anterior: {formatCurrency(data.paso1.acumuladoAnterior)}</p>
                  <p className="font-bold text-blue-900">Total del día: {formatCurrency(data.paso1.total)}</p>
                  <p className="font-bold text-lg text-blue-900">Acumulado: {formatCurrency(data.paso1.acumulado)}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-gray-700">
                <p>Dato 1: {formatCurrency(data.paso1.dato1)}</p>
                <p>Dato 2: {formatCurrency(data.paso1.dato2)}</p>
                <p className="text-sm text-gray-600">Acumulado anterior: {formatCurrency(data.paso1.acumuladoAnterior)}</p>
                <p className="font-bold text-blue-900">Total del día: {formatCurrency(data.paso1.total)}</p>
                <p className="font-bold text-lg text-blue-900">Acumulado: {formatCurrency(data.paso1.acumulado)}</p>
              </div>
            )}
          </div>

          {/* Paso 2 */}
          <div className="border rounded-lg p-4 bg-green-50">
            <h3 className="font-bold text-lg mb-3 text-green-900">Paso 2</h3>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 1</label>
                  <input
                    type="text"
                    value={formatCurrency(data.paso2.dato1)}
                    onChange={(e) => handleEditInputChange('paso2', 'dato1', e.target.value)}
                    className="w-full p-2 border-2 border-green-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 2</label>
                  <input
                    type="text"
                    value={formatCurrency(data.paso2.dato2)}
                    onChange={(e) => handleEditInputChange('paso2', 'dato2', e.target.value)}
                    className="w-full p-2 border-2 border-green-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div className="pt-2 border-t border-green-200">
                  <p className="text-sm text-gray-600">Acumulado anterior: {formatCurrency(data.paso2.acumuladoAnterior)}</p>
                 
                  <p className="font-bold text-lg text-green-900">Acumulado: {formatCurrency(data.paso2.acumulado)}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-gray-700">
                <p>Dato 1: {formatCurrency(data.paso2.dato1)}</p>
                <p>Dato 2: {formatCurrency(data.paso2.dato2)}</p>
                <p className="text-sm text-gray-600">Acumulado anterior: {formatCurrency(data.paso2.acumuladoAnterior)}</p>
                
                <p className="font-bold text-lg text-green-900">Acumulado: {formatCurrency(data.paso2.acumulado)}</p>
              </div>
            )}
          </div>

          {/* Resumen */}
          <div className="border rounded-lg p-4 bg-purple-50">
            <h3 className="font-bold text-lg mb-3 text-purple-900">Resumen</h3>
            <div className="space-y-2 text-gray-700">
              <p>Acumulado Paso 1: {formatCurrency(data.paso1.acumulado)}</p>
              <p>Acumulado Paso 2: {formatCurrency(data.paso2.acumulado)}</p>
              <p className="font-bold text-2xl text-purple-900 mt-4">
                Porcentaje: {data.porcentaje.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {isEditing ? (
            <div className="flex space-x-3">
              <button
                onClick={saveEdit}
                className="flex-1 bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors flex items-center justify-center space-x-2"
              >
                <Check size={20} />
                <span>Guardar Cambios</span>
              </button>
              <button
                onClick={cancelEdit}
                className="flex-1 bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors flex items-center justify-center space-x-2"
              >
                <X size={20} />
                <span>Cancelar</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={() => startEditing(selectedDate)}
                className="w-full bg-orange-500 text-white py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors flex items-center justify-center space-x-2"
              >
                <Edit2 size={20} />
                <span>Editar Datos</span>
              </button>
              <button
                onClick={() => {
                  setSelectedDate(null);
                  setEditData(null);
                  setShowCalendar(true);
                }}
                className="w-full bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
              >
                Volver al Calendario
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (showMonthlyHistory) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
        <div className="max-w-2xl mx-auto">
          {renderMonthlyHistory()}
        </div>
      </div>
    );
  }

  if (showCalendar) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
        <div className="max-w-2xl mx-auto">
          {renderCalendar()}
        </div>
      </div>
    );
  }

  if (selectedDate) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
        <div className="max-w-2xl mx-auto">
          {renderHistoricalView()}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
      {showDatePicker && renderDatePicker()}
      
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-800">Calculadora Diaria</h1>
              <p className="text-gray-600">
                {new Date(simulatedDate + 'T00:00:00').toLocaleDateString('es-CO', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
              <button
                onClick={() => setShowDatePicker(true)}
                className="mt-2 text-sm bg-orange-100 text-orange-700 px-3 py-1 rounded-full hover:bg-orange-200 transition-colors flex items-center space-x-1"
              >
                <CalendarDays size={14} />
                <span>🧪 Cambiar fecha de prueba</span>
              </button>
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

        {/* Navegación */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentView('paso1')}
              disabled={currentView === 'paso2' || (currentView === 'paso1')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                currentView === 'paso1'
                  ? 'bg-blue-500 text-white'
                  : completedSteps.paso2
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Paso 1
            </button>
            <button
              onClick={() => setCurrentView('paso2')}
              disabled={currentView === 'paso2' || !completedSteps.paso1}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                currentView === 'paso2'
                  ? 'bg-green-500 text-white'
                  : completedSteps.paso2
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Paso 2
            </button>
            <button
              onClick={() => setCurrentView('resumen')}
              disabled={!completedSteps.paso2}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                currentView === 'resumen'
                  ? 'bg-purple-500 text-white'
                  : completedSteps.paso2
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Resumen
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          {currentView === 'paso1' && (
            <div>
              <h2 className="text-2xl font-bold text-blue-900 mb-6">Paso 1</h2>
              
              {todayData.paso1.acumuladoAnterior > 0 && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
                  <p className="text-sm text-yellow-800">
                    📊 <strong>Total del día anterior ({getPreviousDay(simulatedDate)}):</strong><br/>
                    Paso 1: {formatCurrency(historicalData[getPreviousDay(simulatedDate)]?.paso1?.total || 0)}
                  </p>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Dato 1</label>
                  <input
                    type="text"
                    value={formatCurrency(todayData.paso1.dato1)}
                    onChange={(e) => handleInputChange('paso1', 'dato1', e.target.value)}
                    disabled={completedSteps.paso1}
                    className={`w-full p-3 border-2 rounded-lg text-lg ${
                      completedSteps.paso1
                        ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed'
                        : 'border-blue-300 focus:border-blue-500 focus:outline-none'
                    }`}
                    placeholder="$0"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Dato 2</label>
                  <input
                    type="text"
                    value={formatCurrency(todayData.paso1.dato2)}
                    onChange={(e) => handleInputChange('paso1', 'dato2', e.target.value)}
                    disabled={completedSteps.paso1}
                    className={`w-full p-3 border-2 rounded-lg text-lg ${
                      completedSteps.paso1
                        ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed'
                        : 'border-blue-300 focus:border-blue-500 focus:outline-none'
                    }`}
                    placeholder="$0"
                  />
                </div>

                <div className="bg-blue-50 p-4 rounded-lg space-y-1">
                  <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(todayData.paso1.total)}</p>
                  <p className="text-blue-900 font-bold text-xl mt-2 pt-2 border-t border-blue-200">
                    Acumulado: {formatCurrency(todayData.paso1.acumulado)}
                  </p>
                </div>

                {!completedSteps.paso1 && (
                  <button
                    onClick={continuarPaso1}
                    disabled={todayData.paso1.dato1 === '' || todayData.paso1.dato2 === ''}
                    className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                      todayData.paso1.dato1 === '' || todayData.paso1.dato2 === ''
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                    }`}
                  >
                    <span>Siguiente: Paso 2</span>
                    <ChevronRight size={20} />
                  </button>
                )}
                
                {completedSteps.paso1 && (
                  <div className="bg-blue-100 p-3 rounded-lg text-center text-blue-800 font-semibold">
                    ✓ Paso completado - Solo lectura
                  </div>
                )}
              </div>
            </div>
          )}

          {currentView === 'paso2' && (
            <div>
              <h2 className="text-2xl font-bold text-green-900 mb-6">Paso 2</h2>

              {todayData.paso2.acumuladoAnterior > 0 && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
                  <p className="text-sm text-yellow-800">
                    📊 <strong>Total del día anterior ({getPreviousDay(simulatedDate)}):</strong><br/>
                    Paso 2: {formatCurrency(historicalData[getPreviousDay(simulatedDate)]?.paso2?.total || 0)}
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Dato 1</label>
                  <input
                    type="text"
                    value={formatCurrency(todayData.paso2.dato1)}
                    onChange={(e) => handleInputChange('paso2', 'dato1', e.target.value)}
                    disabled={completedSteps.paso2}
                    className={`w-full p-3 border-2 rounded-lg text-lg ${
                      completedSteps.paso2
                        ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed'
                        : 'border-green-300 focus:border-green-500 focus:outline-none'
                    }`}
                    placeholder="$0"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Dato 2</label>
                  <input
                    type="text"
                    value={formatCurrency(todayData.paso2.dato2)}
                    onChange={(e) => handleInputChange('paso2', 'dato2', e.target.value)}
                    disabled={completedSteps.paso2}
                    className={`w-full p-3 border-2 rounded-lg text-lg ${
                      completedSteps.paso2
                        ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed'
                        : 'border-green-300 focus:border-green-500 focus:outline-none'
                    }`}
                    placeholder="$0"
                  />
                </div>

                <div className="bg-green-50 p-4 rounded-lg space-y-1">
                  <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(todayData.paso2.total)}</p>
                  <p className="text-green-900 font-bold text-xl mt-2 pt-2 border-t border-green-200">
                    Acumulado: {formatCurrency(todayData.paso2.acumulado)}
                  </p>
                </div>

                {!completedSteps.paso2 && (
                  <button
                    onClick={continuarPaso2}
                    disabled={todayData.paso2.dato1 === '' || todayData.paso2.dato2 === ''}
                    className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                      todayData.paso2.dato1 === '' || todayData.paso2.dato2 === ''
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                  >
                    <span>Ver Resumen</span>
                    <ChevronRight size={20} />
                  </button>
                )}
                
                {completedSteps.paso2 && (
                  <div className="bg-green-100 p-3 rounded-lg text-center text-green-800 font-semibold">
                    ✓ Paso completado - Solo lectura
                  </div>
                )}
              </div>
            </div>
          )}

          {currentView === 'resumen' && (
            <div>
              <h2 className="text-2xl font-bold text-purple-900 mb-6">Resumen del Día</h2>
              
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-bold text-blue-900 mb-3 text-lg">Paso 1</h3>
                  <p className="text-gray-700">Total del día: <span className="font-bold">{formatCurrency(todayData.paso1.total)}</span></p>
                  <p className="text-blue-900 font-bold text-xl mt-2 pt-2 border-t border-blue-200">
                    Acumulado del mes: {formatCurrency(todayData.paso1.acumulado)}
                  </p>
                </div>

                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-bold text-green-900 mb-3 text-lg">Paso 2</h3>
                  <p className="text-gray-700">Total del día: <span className="font-bold">{formatCurrency(todayData.paso2.total)}</span></p>
                  <p className="text-green-900 font-bold text-xl mt-2 pt-2 border-t border-green-200">
                    Acumulado del mes: {formatCurrency(todayData.paso2.acumulado)}
                  </p>
                </div>

                <div className="bg-purple-100 p-6 rounded-lg border-2 border-purple-300">
                  <h3 className="font-bold text-purple-900 text-xl mb-4">Cálculo Final</h3>
                  <p className="text-gray-700 text-lg mb-3">
                    <strong>Total acumulado del mes:</strong><br/>
                    <span className="text-2xl font-bold text-purple-900">
                      {formatCurrency(todayData.paso1.acumulado + todayData.paso2.acumulado)}
                    </span>
                  </p>
                  <div className="border-t-2 border-purple-300 pt-3 mt-3">
                    <p className="font-bold text-purple-900 text-3xl">
                      Porcentaje: {todayData.porcentaje.toFixed(2)}%
                    </p>
                  </div>
                </div>

                <button
                  onClick={saveData}
                  className="w-full bg-purple-500 text-white py-3 rounded-lg font-semibold hover:bg-purple-600 transition-colors flex items-center justify-center space-x-2"
                >
                  <Save size={20} />
                  <span>Guardar Datos del Día</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
